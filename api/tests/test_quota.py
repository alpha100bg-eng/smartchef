"""Quotas mensuels et paliers d'abonnement.

Deux refus distincts, et c'est le cœur de ces tests :
- 402 : la fonctionnalité est fermée au palier gratuit (limite 0)
- 429 : l'enveloppe du mois est épuisée

Dire « réessaie le mois prochain » à quelqu'un qui n'aura jamais accès sans
abonnement est la pire des deux erreurs possibles.
"""
import datetime
from unittest.mock import MagicMock, patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jose import jwk, jwt

import app.deps as deps
from app.main import app
from app.services.plan import FREE, PREMIUM, PremiumRequired
from app.services.quota import QuotaExceeded

client = TestClient(app)
TEST_KID = "test-key-1"
PID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture(scope="module")
def ec_keys():
    pk = ec.generate_private_key(ec.SECP256R1())
    priv = pk.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    pub = pk.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    d = jwk.construct(pub, algorithm="ES256").to_dict()
    d["kid"] = TEST_KID
    d["alg"] = "ES256"
    return priv, d


@pytest.fixture(autouse=True)
def patched_jwks(ec_keys):
    _, pub = ec_keys
    deps._jwks_cache["keys_by_kid"] = {}
    deps._jwks_cache["fetched_at"] = 0.0
    with patch.object(deps, "_fetch_jwks", return_value={"keys": [pub]}):
        yield


def token(ec_keys) -> str:
    priv, _ = ec_keys
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=60)
    return jwt.encode({"sub": PID, "aud": "authenticated", "exp": exp},
                      priv, algorithm="ES256", headers={"kid": TEST_KID})


def auth(ec_keys):
    return {"Authorization": f"Bearer {token(ec_keys)}"}


# ── Le quota bloque AVANT l'appel payant ────────────────────────────
def test_search_over_quota_returns_429_and_skips_the_ai_call(ec_keys):
    with patch("app.quota_guard.quota.consume",
               side_effect=QuotaExceeded("search", 10, FREE)), \
         patch("app.services.search.search_recipes") as ai:
        resp = client.post("/search", headers=auth(ec_keys), json={"query": "omelette"})

    assert resp.status_code == 429
    assert "10" in resp.json()["detail"]
    ai.assert_not_called()  # tout l'intérêt : aucun euro dépensé


def test_vision_over_quota_returns_429(ec_keys):
    with patch("app.quota_guard.quota.consume",
               side_effect=QuotaExceeded("vision", 3, FREE)), \
         patch("app.services.vision.detect_from_storage_path") as ai:
        resp = client.post("/inventory/from-photo", headers=auth(ec_keys),
                           json={"storage_path": f"{PID}/x.jpg"})

    assert resp.status_code == 429
    ai.assert_not_called()


def test_under_quota_lets_the_call_through(ec_keys):
    from app.models.recipe import SearchResult

    with patch("app.quota_guard.quota.consume", return_value=None), \
         patch("app.services.search.search_recipes", return_value=SearchResult(recipes=[])):
        resp = client.post("/search", headers=auth(ec_keys), json={"query": "omelette"})

    assert resp.status_code == 200


# ── Palier gratuit : 402, pas 429 ───────────────────────────────────
def test_meal_plan_is_premium_only(ec_keys):
    with patch("app.quota_guard.quota.consume", side_effect=PremiumRequired("meal_plan")), \
         patch("app.services.meal_plan.generate_meal_plan") as ai:
        resp = client.post("/meal-plan/generate", headers=auth(ec_keys),
                           json={"week_start": "2026-08-17"})

    assert resp.status_code == 402
    assert "Premium" in resp.json()["detail"]
    assert "4,99" in resp.json()["detail"]
    ai.assert_not_called()


def test_shopping_list_is_premium_only(ec_keys):
    with patch("app.quota_guard.quota.consume", side_effect=PremiumRequired("shopping")), \
         patch("app.services.shopping.build_from_plan") as ai:
        resp = client.post("/shopping-list/from-plan", headers=auth(ec_keys),
                           json={"meal_plan_id": "11111111-2222-3333-4444-555555555555"})

    assert resp.status_code == 402
    ai.assert_not_called()


def test_the_two_refusals_say_different_things(ec_keys):
    """Un gratuit doit être invité à s'abonner ; un abonné à attendre le mois
    suivant. Confondre les deux messages est le vrai risque produit."""
    with patch("app.quota_guard.quota.consume", side_effect=PremiumRequired("meal_plan")):
        ferme = client.post("/meal-plan/generate", headers=auth(ec_keys),
                            json={"week_start": "2026-08-17"}).json()["detail"]

    with patch("app.quota_guard.quota.consume",
               side_effect=QuotaExceeded("meal_plan", 8, PREMIUM)):
        epuise = client.post("/meal-plan/generate", headers=auth(ec_keys),
                             json={"week_start": "2026-08-17"}).json()["detail"]

    assert "Premium" in ferme and "mois prochain" not in ferme
    assert "1er du mois" in epuise
    assert ferme != epuise


# ── Le compteur lui-même ────────────────────────────────────────────
def _admin_with(rpc_result):
    admin = MagicMock()
    admin.rpc.return_value.execute.return_value = MagicMock(data=rpc_result)
    return admin


def test_consume_raises_when_the_db_says_no():
    from app.services import quota as quota_mod

    admin = _admin_with(False)
    with patch.object(quota_mod, "get_supabase_admin", return_value=admin), \
         patch("app.services.plan.current_plan", return_value=PREMIUM):
        with pytest.raises(QuotaExceeded):
            quota_mod.consume(PID, "meal_plan")

    # La limite part vers Postgres, qui tranche de façon atomique.
    args = admin.rpc.call_args[0]
    assert args[0] == "consume_ai_quota_period"
    assert args[1]["p_kind"] == "meal_plan"
    assert args[1]["p_limit"] > 0
    assert args[1]["p_monthly"] is True


def test_consume_passes_when_the_db_says_yes():
    from app.services import quota as quota_mod

    with patch.object(quota_mod, "get_supabase_admin", return_value=_admin_with(True)), \
         patch("app.services.plan.current_plan", return_value=FREE):
        quota_mod.consume(PID, "search")  # ne doit pas lever


def test_a_free_account_never_reaches_postgres_for_a_premium_feature():
    """Inutile d'interroger la base pour une fonctionnalité fermée — et surtout,
    ça ne doit pas consommer une unité au passage."""
    from app.services import quota as quota_mod

    admin = _admin_with(True)
    with patch.object(quota_mod, "get_supabase_admin", return_value=admin), \
         patch("app.services.plan.current_plan", return_value=FREE):
        with pytest.raises(PremiumRequired):
            quota_mod.consume(PID, "meal_plan")

    admin.rpc.assert_not_called()


def test_premium_gets_a_bigger_envelope_than_free():
    from app.services.plan import limit_of

    for kind in ("vision", "search"):
        assert limit_of(PREMIUM, kind) > limit_of(FREE, kind)
    assert limit_of(FREE, "meal_plan") == 0
    assert limit_of(PREMIUM, "meal_plan") > 0
