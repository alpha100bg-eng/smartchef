import datetime
from unittest.mock import patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jose import jwk, jwt

import app.deps as deps
from app.main import app
from app.models.recipe import Recipe, RecipeIngredient, RecipeSummary, SearchResult

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


def test_search_returns_summaries_not_full_recipes(ec_keys):
    """The listing is deliberately light: titles + teasers only. Steps and
    ingredients cost time and money, so they come from /search/detail."""
    fake = SearchResult(
        recipes=[
            RecipeSummary(
                title="Omelette aux tomates",
                teaser="Un classique rapide, moelleux à cœur.",
                prep_time_min=15,
                servings=2,
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
    assert body["recipes"][0]["teaser"]
    assert body["recipes"][0]["uses_inventory"] == ["œufs", "tomate"]
    # No expensive payload in the listing.
    assert "steps" not in body["recipes"][0]


def test_detail_returns_the_full_recipe(ec_keys):
    full = Recipe(
        title="Omelette aux tomates",
        teaser="Un classique rapide, moelleux à cœur.",
        prep_time_min=15,
        servings=2,
        uses_inventory=["œufs"],
        ingredients=[RecipeIngredient(name="œufs", quantity=3, unit="pièce")],
        steps=["Battre les œufs", "Cuire à feu doux 4 minutes"],
    )
    with patch("app.services.search.recipe_detail", return_value=full):
        resp = client.post(
            "/search/detail",
            headers={"Authorization": f"Bearer {token(ec_keys)}"},
            json={"title": "Omelette aux tomates", "teaser": "Un classique"},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["steps"]) == 2
    assert body["ingredients"][0]["name"] == "œufs"


def test_detail_requires_auth():
    resp = client.post("/search/detail", json={"title": "Omelette"})
    assert resp.status_code == 403


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
