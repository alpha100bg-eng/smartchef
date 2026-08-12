import datetime
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)


def test_photo_cleanup_requires_secret():
    with patch.object(settings, "cron_secret", "s3cret"):
        assert client.post("/jobs/photo-cleanup").status_code == 401
        assert (
            client.post(
                "/jobs/photo-cleanup",
                headers={"Authorization": "Bearer wrong"},
            ).status_code
            == 401
        )


def test_photo_cleanup_runs_with_secret():
    with patch.object(settings, "cron_secret", "s3cret"), patch(
        "app.routers.jobs.photo_cleanup.sweep_orphans", return_value=3
    ):
        resp = client.post(
            "/jobs/photo-cleanup", headers={"Authorization": "Bearer s3cret"}
        )
    assert resp.status_code == 200
    assert resp.json() == {"removed": 3}


def test_sweep_orphans_deletes_only_stale():
    from app.services import photo_cleanup

    now = datetime.datetime.now(datetime.timezone.utc)
    old = (now - datetime.timedelta(hours=48)).isoformat()
    fresh = (now - datetime.timedelta(hours=1)).isoformat()

    storage = MagicMock()
    # top-level: one profile folder; then its files (one stale, one fresh)
    storage.list.side_effect = [
        [{"name": "profileA"}],
        [
            {"name": "old.jpg", "created_at": old},
            {"name": "new.jpg", "created_at": fresh},
        ],
    ]
    admin = MagicMock()
    admin.storage.from_.return_value = storage

    with patch.object(photo_cleanup, "get_supabase_admin", return_value=admin):
        removed = photo_cleanup.sweep_orphans()

    assert removed == 1
    storage.remove.assert_called_once_with(["profileA/old.jpg"])
