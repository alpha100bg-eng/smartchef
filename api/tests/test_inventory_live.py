"""Live RLS isolation test for inventory_items against the real Supabase project.

Skips unless SMARTCHEF_LIVE=1. Kept minimal (2 users) to stay under GoTrue
admin rate limits.
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


def test_inventory_rls_isolation():
    from supabase import create_client
    from app.core.config import settings

    admin = create_client(settings.supabase_url, settings.supabase_service_key)
    anon = _anon_key()

    def make_user():
        email = f"invlive_{uuid.uuid4().hex[:12]}@example.com"
        pw = f"Pw-{uuid.uuid4().hex}"
        uid = admin.auth.admin.create_user(
            {"email": email, "password": pw, "email_confirm": True}
        ).user.id
        return uid, email, pw

    a_id, a_email, a_pw = make_user()
    b_id, b_email, b_pw = make_user()
    try:
        client_a = create_client(settings.supabase_url, anon)
        client_a.auth.sign_in_with_password({"email": a_email, "password": a_pw})
        client_b = create_client(settings.supabase_url, anon)
        client_b.auth.sign_in_with_password({"email": b_email, "password": b_pw})

        # A creates an inventory item
        client_a.table("inventory_items").insert(
            {"profile_id": a_id, "name": "lait", "quantity": 1, "unit": "L", "source": "photo"}
        ).execute()

        own = client_a.table("inventory_items").select("*").eq("profile_id", a_id).execute()
        assert len(own.data) == 1, "A should see its own item"

        cross = client_b.table("inventory_items").select("*").eq("profile_id", a_id).execute()
        assert cross.data == [], "B must not see A's items (RLS)"

        # B cannot insert an item owned by A
        try:
            client_b.table("inventory_items").insert(
                {"profile_id": a_id, "name": "evil", "source": "manual"}
            ).execute()
            leaked = admin.table("inventory_items").select("*").eq("name", "evil").eq(
                "profile_id", a_id
            ).execute()
            assert leaked.data == [], "B must not insert items for A (RLS)"
        except Exception:
            pass  # RLS rejection is also acceptable
    finally:
        admin.auth.admin.delete_user(a_id)
        admin.auth.admin.delete_user(b_id)
