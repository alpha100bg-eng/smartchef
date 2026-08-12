"""Non-mocked end-to-end test against a REAL Supabase project.

Skips cleanly unless SMARTCHEF_LIVE=1 (and a real api/.env is present). Uses the
service key to create one confirmed user, signs in through the anon client to get
a genuine ES256 JWT, and drives the real FastAPI app (real JWKS verification).

Kept to a single create + single delete to stay well under GoTrue's admin
rate limits — running many user create/delete ops back-to-back can return 403.

Run with:
    SMARTCHEF_LIVE=1 .venv/Scripts/python.exe -m pytest tests/test_auth_live.py -v
"""
import os
import uuid
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(
    os.getenv("SMARTCHEF_LIVE") != "1",
    reason="live Supabase test; set SMARTCHEF_LIVE=1 with real .env to run",
)


def _anon_key() -> str:
    app_env = Path(__file__).resolve().parents[2] / "app" / ".env"
    for line in app_env.read_text(encoding="utf-8").splitlines():
        if line.startswith("EXPO_PUBLIC_SUPABASE_ANON_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError("anon key not found in app/.env")


def test_real_jwt_trigger_and_cascade():
    """(5) real ES256 JWT verified via JWKS reaches the handler;
    (2) the DB trigger auto-created the profile row (GET returns it);
    (4) DELETE /profiles/me purges the profile and its allergies (cascade)."""
    from fastapi.testclient import TestClient
    from supabase import create_client

    from app.core.config import settings
    from app.main import app

    admin = create_client(settings.supabase_url, settings.supabase_service_key)
    email = f"livetest_{uuid.uuid4().hex[:12]}@example.com"
    password = f"Pw-{uuid.uuid4().hex}"
    user_id = admin.auth.admin.create_user(
        {"email": email, "password": password, "email_confirm": True}
    ).user.id

    deleted_via_endpoint = False
    try:
        anon = create_client(settings.supabase_url, _anon_key())
        token = anon.auth.sign_in_with_password(
            {"email": email, "password": password}
        ).session.access_token

        client = TestClient(app)

        # (5) + (2): real JWT accepted, trigger-created profile returned
        me = client.get("/profiles/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200, me.text
        assert me.json()["id"] == user_id

        # (4): seed allergies, then delete account through the real endpoint
        admin.table("allergies").insert(
            {"profile_id": user_id, "label": "arachides"}
        ).execute()

        deleted = client.delete(
            "/profiles/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert deleted.status_code == 204, deleted.text
        deleted_via_endpoint = True

        prof = admin.table("profiles").select("*").eq("id", user_id).execute()
        alg = admin.table("allergies").select("*").eq("profile_id", user_id).execute()
        assert prof.data == [], f"profile not purged: {prof.data}"
        assert alg.data == [], f"allergies not cascade-purged: {alg.data}"
    finally:
        if not deleted_via_endpoint:
            admin.auth.admin.delete_user(user_id)
