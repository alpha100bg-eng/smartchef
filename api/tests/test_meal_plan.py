import datetime
from unittest.mock import patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jose import jwk, jwt

import app.deps as deps
from app.main import app
from app.models.meal_plan import MealPlanEntryView, MealPlanView, PlanRecipe

client = TestClient(app)
TEST_KID = "test-key-1"
PROFILE_ID = "11111111-1111-1111-1111-111111111111"


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
    jwk_d = jwk.construct(pub, algorithm="ES256").to_dict()
    jwk_d["kid"] = TEST_KID
    jwk_d["alg"] = "ES256"
    return priv, jwk_d


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
    return jwt.encode({"sub": PROFILE_ID, "aud": "authenticated", "exp": exp},
                      priv, algorithm="ES256", headers={"kid": TEST_KID})


def _fake_view():
    return MealPlanView(
        id="plan-1", week_start="2026-08-03", budget_target=50, estimated_cost=44.5,
        entries=[MealPlanEntryView(
            day="2026-08-03", slot="dinner",
            recipe=PlanRecipe(title="Riz aux légumes", prep_time_min=20, servings=2,
                              macros={"kcal": 500}, ingredients=[], instructions="Cuire."),
        )],
    )


def test_generate_returns_plan(ec_keys):
    with patch("app.services.meal_plan.generate_meal_plan", return_value=_fake_view()):
        resp = client.post("/meal-plan/generate",
                           headers={"Authorization": f"Bearer {token(ec_keys)}"},
                           json={"week_start": "2026-08-03", "budget": 50})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["estimated_cost"] == 44.5
    assert body["entries"][0]["recipe"]["title"] == "Riz aux légumes"


def test_get_plan_not_found(ec_keys):
    with patch("app.services.meal_plan.get_meal_plan", side_effect=LookupError()):
        resp = client.get("/meal-plan/bogus",
                          headers={"Authorization": f"Bearer {token(ec_keys)}"})
    assert resp.status_code == 404


def test_generate_requires_auth():
    resp = client.post("/meal-plan/generate", json={"week_start": "2026-08-03"})
    assert resp.status_code == 403
