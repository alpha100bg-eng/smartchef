"""Ce que l'utilisateur lit quand quelque chose échoue.

Deux exigences, longtemps absentes :

1. Aucun détail technique ne sort. Les routes renvoyaient le texte de
   l'exception — « search failed: Error code: 529 {...} ». Un message de SDK
   tiers peut contenir des URL, des en-têtes ou des identifiants de requête,
   et ce n'est de toute façon pas lisible.

2. Le message est dans la langue de l'utilisateur. Les refus de quota sont
   exactement ce qu'on lit juste avant de s'abonner : les laisser en français
   pour un hispanophone, c'est perdre la vente au pire moment.
"""
import datetime
from unittest.mock import patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jose import jwk, jwt

import app.deps as deps
from app import errors
from app.lang import SUPPORTED
from app.main import app
from app.services.plan import FREE, PremiumRequired
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


def auth(ec_keys) -> dict[str, str]:
    priv, _ = ec_keys
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=60)
    jeton = jwt.encode({"sub": PID, "aud": "authenticated", "exp": exp},
                       priv, algorithm="ES256", headers={"kid": TEST_KID})
    return {"Authorization": f"Bearer {jeton}"}


# Ce qu'une vraie exception de SDK peut contenir : un code, une structure
# interne, et une URL qui n'a rien à faire sous les yeux d'un utilisateur.
FUITE = (
    "Error code: 529 - {'type': 'error', 'error': {'type': 'overloaded_error'}} "
    "https://api.anthropic.com/v1/messages"
)


# ── Aucun detail technique ne sort ──────────────────────────────────
def test_un_echec_de_l_ia_ne_revele_rien_de_l_exception(ec_keys):
    with patch("app.quota_guard.quota.consume", return_value=None), \
         patch("app.services.search.search_recipes", side_effect=RuntimeError(FUITE)):
        resp = client.post("/search", headers=auth(ec_keys), json={"query": "omelette"})

    detail = resp.json()["detail"]
    assert resp.status_code == 502
    assert detail == errors.IA["fr"]
    for interne in ("529", "overloaded_error", "anthropic.com", "RuntimeError"):
        assert interne not in detail


def test_l_echec_est_journalise_avec_sa_pile(ec_keys, caplog):
    # Le détail disparaît de la réponse : s'il ne partait pas non plus dans le
    # journal, plus personne ne saurait ce qui a cassé en production.
    with patch("app.quota_guard.quota.consume", return_value=None), \
         patch("app.services.search.search_recipes", side_effect=RuntimeError(FUITE)):
        client.post("/search", headers=auth(ec_keys), json={"query": "omelette"})

    assert FUITE in caplog.text
    assert "Traceback" in caplog.text


# ── Les refus parlent la langue de l'utilisateur ────────────────────
@pytest.mark.parametrize("langue", SUPPORTED)
def test_le_refus_de_quota_est_traduit(ec_keys, langue):
    with patch("app.quota_guard.quota.consume",
               side_effect=QuotaExceeded("search", 10, FREE)):
        resp = client.post("/search", headers={**auth(ec_keys),
                                               "Accept-Language": langue},
                           json={"query": "omelette"})

    detail = resp.json()["detail"]
    assert resp.status_code == 429
    assert detail.startswith(errors.QUOTA[langue].split("{")[0])
    assert "10" in detail
    assert detail.endswith(errors.QUOTA_SUITE_GRATUIT[langue])


@pytest.mark.parametrize("langue", SUPPORTED)
def test_l_invitation_a_s_abonner_est_traduite(ec_keys, langue):
    with patch("app.quota_guard.quota.consume", side_effect=PremiumRequired("meal_plan")):
        resp = client.post("/meal-plan/generate",
                           headers={**auth(ec_keys), "Accept-Language": langue},
                           json={"week_start": "2026-08-17"})

    detail = resp.json()["detail"]
    assert resp.status_code == 402
    # Le nom de la fonctionnalité perdue : c'est lui qui donne envie de payer.
    assert errors.FONCTIONNALITES["meal_plan"][langue] in detail
    assert "4,99" in detail


def test_une_langue_inconnue_retombe_sur_le_francais(ec_keys):
    with patch("app.quota_guard.quota.consume",
               side_effect=QuotaExceeded("search", 10, FREE)):
        resp = client.post("/search",
                           headers={**auth(ec_keys), "Accept-Language": "ja"},
                           json={"query": "omelette"})

    assert resp.json()["detail"].startswith("Tu as utilisé")


# ── Le catalogue reste complet ──────────────────────────────────────
@pytest.mark.parametrize("nom", [
    "IA", "PAIEMENT", "DEJA_ABONNE", "PAIEMENT_INACTIF", "ESSAI_TERMINE",
    "QUOTA", "QUOTA_SUITE_GRATUIT", "QUOTA_SUITE_PAYANT",
])
def test_chaque_message_existe_dans_les_sept_langues(nom):
    # Une langue ajoutée sans son message retomberait silencieusement sur le
    # français ; ce test rend l'oubli visible.
    traductions = getattr(errors, nom)
    assert set(traductions) == set(SUPPORTED), f"{nom} : langues manquantes"
    assert all(v.strip() for v in traductions.values())


def test_les_variables_sont_les_memes_dans_toutes_les_langues():
    # Un « {prix} » oublié afficherait une phrase tronquée, ou lèverait un
    # KeyError au moment du formatage.
    import re

    for nom in ("ESSAI_TERMINE", "QUOTA"):
        traductions = getattr(errors, nom)
        attendu = sorted(re.findall(r"\{(\w+)\}", traductions["fr"]))
        for langue, texte in traductions.items():
            assert sorted(re.findall(r"\{(\w+)\}", texte)) == attendu, f"{nom}/{langue}"


@pytest.mark.parametrize("categorie", ["vision", "search", "meal_plan", "shopping"])
def test_chaque_categorie_de_quota_a_ses_libelles(categorie):
    assert set(errors.LABELS[categorie]) == set(SUPPORTED)
