import datetime
from unittest.mock import MagicMock, patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jose import jwk, jwt

import app.deps as deps
from app.main import app
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


# ── the quota must block BEFORE the paid call happens ───────────────
def test_search_over_quota_returns_429_and_skips_the_ai_call(ec_keys):
    with patch("app.routers.search.quota.consume", side_effect=QuotaExceeded("search", 50)), \
         patch("app.services.search.search_recipes") as ai:
        resp = client.post("/search", headers=auth(ec_keys), json={"query": "omelette"})

    assert resp.status_code == 429
    assert "50" in resp.json()["detail"]
    ai.assert_not_called()  # the whole point: no money spent


def test_meal_plan_over_quota_returns_429(ec_keys):
    with patch("app.routers.meal_plan.quota.consume", side_effect=QuotaExceeded("meal_plan", 5)), \
         patch("app.services.meal_plan.generate_meal_plan") as ai:
        resp = client.post("/meal-plan/generate", headers=auth(ec_keys),
                           json={"week_start": "2026-08-17"})

    assert resp.status_code == 429
    ai.assert_not_called()


def test_vision_over_quota_returns_429(ec_keys):
    with patch("app.routers.inventory.quota.consume", side_effect=QuotaExceeded("vision", 20)), \
         patch("app.services.vision.detect_from_storage_path") as ai:
        resp = client.post("/inventory/from-photo", headers=auth(ec_keys),
                           json={"storage_path": f"{PID}/x.jpg"})

    assert resp.status_code == 429
    ai.assert_not_called()


def test_under_quota_lets_the_call_through(ec_keys):
    from app.models.recipe import SearchResult

    with patch("app.routers.search.quota.consume", return_value=None), \
         patch("app.services.search.search_recipes", return_value=SearchResult(recipes=[])):
        resp = client.post("/search", headers=auth(ec_keys), json={"query": "omelette"})

    assert resp.status_code == 200


# ── the counter itself ──────────────────────────────────────────────
def test_consume_raises_when_the_db_says_no():
    from app.services import quota as quota_mod

    admin = MagicMock()
    admin.rpc.return_value.execute.return_value = MagicMock(data=False)
    with patch.object(quota_mod, "get_supabase_admin", return_value=admin):
        with pytest.raises(QuotaExceeded):
            quota_mod.consume(PID, "meal_plan")

    # the limit is passed to Postgres, which decides atomically
    args = admin.rpc.call_args[0]
    assert args[0] == "consume_ai_quota"
    assert args[1]["p_kind"] == "meal_plan"
    assert args[1]["p_limit"] > 0


def test_consume_passes_when_the_db_says_yes():
    from app.services import quota as quota_mod

    admin = MagicMock()
    admin.rpc.return_value.execute.return_value = MagicMock(data=True)
    with patch.object(quota_mod, "get_supabase_admin", return_value=admin):
        quota_mod.consume(PID, "search")  # must not raise
