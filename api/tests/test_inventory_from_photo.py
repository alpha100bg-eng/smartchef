import datetime
from unittest.mock import MagicMock, patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jose import jwk, jwt

import app.deps as deps
from app.main import app
from app.models.inventory import DetectedItem, VisionResult

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


def token(ec_keys, sub: str = PROFILE_ID) -> str:
    private_pem, _ = ec_keys
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=60)
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "exp": exp},
        private_pem,
        algorithm="ES256",
        headers={"kid": TEST_KID},
    )


def test_from_photo_returns_detected_items(ec_keys):
    fake_result = VisionResult(
        items=[
            DetectedItem(name="lait", quantity=1, unit="L", confidence=0.9),
            DetectedItem(name="tomate", quantity=3, unit="pièce", confidence=0.4),
        ]
    )
    with patch("app.services.vision.detect_from_storage_path", return_value=fake_result):
        resp = client.post(
            "/inventory/from-photo",
            headers={"Authorization": f"Bearer {token(ec_keys)}"},
            json={"storage_path": f"{PROFILE_ID}/abc.jpg"},
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert [i["name"] for i in body["items"]] == ["lait", "tomate"]
    assert body["items"][1]["confidence"] == 0.4


def test_from_photo_rejects_foreign_path(ec_keys):
    """Path ownership check — the service key bypasses Storage RLS, so the
    endpoint must reject a path under another user's folder."""
    with patch("app.services.vision.detect_from_storage_path") as mock_detect:
        resp = client.post(
            "/inventory/from-photo",
            headers={"Authorization": f"Bearer {token(ec_keys)}"},
            json={"storage_path": "22222222-2222-2222-2222-222222222222/x.jpg"},
        )

    assert resp.status_code == 403
    mock_detect.assert_not_called()


def test_from_photo_requires_auth():
    resp = client.post(
        "/inventory/from-photo", json={"storage_path": f"{PROFILE_ID}/abc.jpg"}
    )
    assert resp.status_code == 403  # no bearer credentials
