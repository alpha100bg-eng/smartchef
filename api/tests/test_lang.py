"""Langue de sortie de l'IA, pilotée par `Accept-Language`.

Les prompts restent rédigés en français — ils sont longs et réglés finement —
et reçoivent une consigne de sortie. Ces tests vérifient que la consigne part
bien jusqu'au modèle, parce qu'une recette en français servie à un
anglophone est invisible dans les tests d'interface.
"""
import datetime
from unittest.mock import patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jose import jwk, jwt

import app.deps as deps
from app.lang import EN, FR, output_clause, parse
from app.main import app

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


def auth(ec_keys, lang: str | None = None):
    priv, _ = ec_keys
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=60)
    tok = jwt.encode({"sub": PID, "aud": "authenticated", "exp": exp},
                     priv, algorithm="ES256", headers={"kid": TEST_KID})
    h = {"Authorization": f"Bearer {tok}"}
    if lang:
        h["Accept-Language"] = lang
    return h


# ── Lecture de l'en-tête ────────────────────────────────────────────
@pytest.mark.parametrize("entete,attendu", [
    ("en", EN),
    ("fr", FR),
    ("en-GB,en;q=0.9", EN),
    ("fr-BE,fr;q=0.9,en;q=0.8", FR),
    ("de-DE,de;q=0.9,en;q=0.8", EN),   # allemand ignoré, anglais retenu
    ("de", FR),                         # aucune langue connue -> référence
    ("", FR),
    (None, FR),
])
def test_parse(entete, attendu):
    assert parse(entete) == attendu


def test_the_clause_is_empty_in_french():
    """Le français est la langue d'origine des prompts : rien à ajouter, et le
    préfixe mis en cache reste identique à ce qu'il était."""
    assert output_clause(FR) == ""
    assert "anglais" in output_clause(EN)


# ── La langue arrive jusqu'au service ───────────────────────────────
def test_search_passes_english_down(ec_keys):
    from app.models.recipe import SearchResult

    with patch("app.services.search.search_recipes",
               return_value=SearchResult(recipes=[])) as svc:
        client.post("/search", headers=auth(ec_keys, "en"), json={"query": "pasta"})

    assert svc.call_args[0][2] == EN


def test_search_defaults_to_french_without_the_header(ec_keys):
    from app.models.recipe import SearchResult

    with patch("app.services.search.search_recipes",
               return_value=SearchResult(recipes=[])) as svc:
        client.post("/search", headers=auth(ec_keys), json={"query": "pâtes"})

    assert svc.call_args[0][2] == FR


def test_vision_passes_the_language(ec_keys):
    from app.models.inventory import VisionResult

    with patch("app.services.vision.detect_from_storage_path",
               return_value=VisionResult(items=[])) as svc:
        client.post("/inventory/from-photo", headers=auth(ec_keys, "en-US"),
                    json={"storage_path": f"{PID}/x.jpg"})

    assert svc.call_args[0][1] == EN


def test_meal_plan_passes_the_language(ec_keys):
    from app.models.meal_plan import MealPlanView

    vue = MealPlanView(id="p1", week_start="2026-10-05", entries=[])
    with patch("app.services.meal_plan.generate_meal_plan", return_value=vue) as svc:
        client.post("/meal-plan/generate", headers=auth(ec_keys, "en"),
                    json={"week_start": "2026-10-05"})

    assert svc.call_args[0][3] == EN


# ── La consigne atteint réellement le prompt système ────────────────
def test_the_system_prompt_carries_the_instruction():
    """Le point qui compte : sans cette concaténation, tout le reste du
    câblage serait inutile."""
    from app.services import search

    with patch.object(search, "_client") as client_mock, \
         patch.object(search, "load_context", return_value={
             "inventory": [], "profile": {}, "allergies": []}):
        client_mock.return_value.messages.parse.return_value.parsed_output = None
        search.search_recipes(PID, "pasta", EN)

    envoye = client_mock.return_value.messages.parse.call_args.kwargs["system"][0]["text"]
    assert "anglais" in envoye
    assert envoye.startswith(search.SYSTEM_PROMPT)  # le prompt réglé est intact


def test_french_leaves_the_prompt_untouched():
    """Le préfixe mis en cache doit rester identique en français, sinon on
    perdrait le bénéfice du cache sur la langue principale."""
    from app.services import search

    with patch.object(search, "_client") as client_mock, \
         patch.object(search, "load_context", return_value={
             "inventory": [], "profile": {}, "allergies": []}):
        client_mock.return_value.messages.parse.return_value.parsed_output = None
        search.search_recipes(PID, "pâtes", FR)

    envoye = client_mock.return_value.messages.parse.call_args.kwargs["system"][0]["text"]
    assert envoye == search.SYSTEM_PROMPT
