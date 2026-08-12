import datetime
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)


# ── endpoint protection (cron secret, never a user JWT) ─────────────
def test_expiry_check_requires_cron_secret():
    with patch.object(settings, "cron_secret", "s3cret"):
        assert client.post("/jobs/expiry-check").status_code == 401
        assert client.post(
            "/jobs/expiry-check", headers={"Authorization": "Bearer wrong"}
        ).status_code == 401


def test_expiry_check_runs_with_secret():
    with patch.object(settings, "cron_secret", "s3cret"), patch(
        "app.routers.jobs.expiry.run_expiry_check",
        return_value={"items": 2, "profiles_notified": 1, "pushes_sent": 1},
    ):
        resp = client.post(
            "/jobs/expiry-check", headers={"Authorization": "Bearer s3cret"}
        )
    assert resp.status_code == 200
    assert resp.json()["pushes_sent"] == 1


# ── selection logic (window + consent + stamping) ───────────────────
def _admin_mock(items, tokens):
    admin = MagicMock()
    updated = {}

    def table(name):
        t = MagicMock()
        if name == "inventory_items":
            (t.select.return_value.is_.return_value.gte.return_value
             .lte.return_value.execute.return_value.data) = items

            def update(payload):
                updated["payload"] = payload
                u = MagicMock()

                def in_(col, ids):
                    updated["ids"] = ids
                    return MagicMock()

                u.in_.side_effect = in_
                return u

            t.update.side_effect = update
        elif name == "push_tokens":
            t.select.return_value.in_.return_value.execute.return_value.data = tokens
        return t

    admin.table.side_effect = table
    return admin, updated


def test_notifies_and_stamps_only_consenting_profiles():
    from app.services import expiry

    items = [
        {"id": "i1", "profile_id": "A", "name": "lait", "expiry_date": "2026-08-04"},
        {"id": "i2", "profile_id": "A", "name": "yaourt", "expiry_date": "2026-08-05"},
        # profile B has no push token → no consent → skipped and NOT stamped
        {"id": "i3", "profile_id": "B", "name": "poulet", "expiry_date": "2026-08-04"},
    ]
    tokens = [{"profile_id": "A", "token": "ExponentPushToken[A]"}]
    admin, updated = _admin_mock(items, tokens)

    with patch.object(expiry, "get_supabase_admin", return_value=admin), patch.object(
        expiry, "_send"
    ) as send:
        summary = expiry.run_expiry_check(today=datetime.date(2026, 8, 3))

    assert summary == {"items": 3, "profiles_notified": 1, "pushes_sent": 1}
    # only profile A's items get stamped — B stays notifiable once it opts in
    assert set(updated["ids"]) == {"i1", "i2"}
    assert "expiry_notified_at" in updated["payload"]

    sent = send.call_args[0][0]
    assert sent[0]["to"] == "ExponentPushToken[A]"
    # deep-link recycles the search screen (F5)
    assert sent[0]["data"]["url"].startswith("smartchef://search?q=")


def test_no_items_is_a_noop():
    from app.services import expiry

    admin, _ = _admin_mock([], [])
    with patch.object(expiry, "get_supabase_admin", return_value=admin), patch.object(
        expiry, "_send"
    ) as send:
        summary = expiry.run_expiry_check(today=datetime.date(2026, 8, 3))

    assert summary == {"items": 0, "profiles_notified": 0, "pushes_sent": 0}
    send.assert_not_called()
