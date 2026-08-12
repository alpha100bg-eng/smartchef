import datetime
from unittest.mock import patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jose import jwk, jwt

import app.deps as deps
from app.main import app
from app.models.recipe import Recipe, RecipeIngredient, SearchResult

client = TestClient(app)

TEST_KID = "test-key-1"
PROFILE_ID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture(scope="module")
def ec_keys():
    private_key = ec.generate_private_key(ec.SECP256R1())
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public_pem = (
        private_key.public_key()
        .public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    public_jwk = jwk.construct(public_pem, algorithm="ES256").to_dict()
    public_jwk["kid"] = TEST_KID
    public_jwk["alg"] = "ES256"
    return private_pem, public_jwk


@pytest.fixture(autouse=True)
def patched_jwks(ec_keys):
    _, public_jwk = ec_keys
    deps._jwks_cache["keys_by_kid"] = {}
    deps._jwks_cache["fetched_at"] = 0.0
    with patch.object(deps, "_fetch_jwks", return_value={"keys": [public_jwk]}):
        yield


def token(ec_keys) -> str:
    private_pem, _ = ec_keys
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=60)
    return jwt.encode(
        {"sub": PROFILE_ID, "aud": "authenticated", "exp": exp},
        private_pem,
        algorithm="ES256",
        headers={"kid": TEST_KID},
    )


def test_search_returns_recipes(ec_keys):
    fake = SearchResult(
        recipes=[
            Recipe(
                title="Omelette aux tomates",
                prep_time_min=15,
                servings=2,
                ingredients=[
                    RecipeIngredient(name="œufs", quantity=3, unit="pièce"),
                    RecipeIngredient(name="tomate", quantity=2, unit="pièce"),
                ],
                steps=["Battre les œufs", "Cuire avec les tomates"],
                uses_inventory=["œufs", "tomate"],
            )
        ]
    )
    with patch("app.services.search.search_recipes", return_value=fake):
        resp = client.post(
            "/search",
            headers={"Authorization": f"Bearer {token(ec_keys)}"},
            json={"query": "omelette rapide"},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["recipes"][0]["title"] == "Omelette aux tomates"
    assert body["recipes"][0]["uses_inventory"] == ["œufs", "tomate"]


def test_search_rejects_empty_query(ec_keys):
    resp = client.post(
        "/search",
        headers={"Authorization": f"Bearer {token(ec_keys)}"},
        json={"query": "   "},
    )
    assert resp.status_code == 400


def test_search_requires_auth():
    resp = client.post("/search", json={"query": "omelette"})
    assert resp.status_code == 403
