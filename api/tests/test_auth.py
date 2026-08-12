import datetime
from unittest.mock import MagicMock, patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jose import jwk, jwt

import app.deps as deps
from app.main import app

client = TestClient(app)

TEST_KID = "test-key-1"


@pytest.fixture(scope="module")
def ec_keys():
    """Generate an ES256 (P-256) keypair; return (private PEM, public JWK)."""
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
    """Reset the module cache and serve our test public key as the JWKS,
    exercising the real caching path without any network call."""
    _, public_jwk = ec_keys
    deps._jwks_cache["keys_by_kid"] = {}
    deps._jwks_cache["fetched_at"] = 0.0
    with patch.object(deps, "_fetch_jwks", return_value={"keys": [public_jwk]}):
        yield


def make_token(
    ec_keys,
    sub: str = "11111111-1111-1111-1111-111111111111",
    expired: bool = False,
    kid: str = TEST_KID,
    audience: str = "authenticated",
) -> str:
    private_pem, _ = ec_keys
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
        minutes=-5 if expired else 60
    )
    return jwt.encode(
        {"sub": sub, "aud": audience, "exp": exp},
        private_pem,
        algorithm="ES256",
        headers={"kid": kid},
    )


def test_missing_token_is_rejected():
    response = client.get("/profiles/me")
    assert response.status_code == 403  # HTTPBearer: no credentials supplied


def test_malformed_token_is_rejected():
    response = client.get(
        "/profiles/me", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert response.status_code == 401


def test_unknown_kid_is_rejected(ec_keys):
    token = make_token(ec_keys, kid="some-other-kid")
    response = client.get(
        "/profiles/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401


def test_expired_token_is_rejected(ec_keys):
    token = make_token(ec_keys, expired=True)
    response = client.get(
        "/profiles/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401


def test_wrong_audience_is_rejected(ec_keys):
    token = make_token(ec_keys, audience="something-else")
    response = client.get(
        "/profiles/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401


def test_valid_token_reaches_the_handler(ec_keys):
    profile_id = "11111111-1111-1111-1111-111111111111"
    token = make_token(ec_keys, sub=profile_id)

    fake_result = MagicMock(data={"id": profile_id, "goals": []})
    with patch("app.routers.profiles.get_supabase_admin") as mock_get_admin:
        mock_get_admin.return_value.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            fake_result
        )
        response = client.get(
            "/profiles/me", headers={"Authorization": f"Bearer {token}"}
        )

    assert response.status_code == 200
    assert response.json()["id"] == profile_id
