"""RGPD safety net: delete orphaned fridge photos.

The primary deletion happens inline after inventory validation (and on review
cancel) in the app. This cron sweep catches photos left behind if the app died
between upload and review — nothing should normally linger here.
"""
import datetime

from app.core.supabase_client import get_supabase_admin

BUCKET = "fridge-photos"
MAX_AGE_HOURS = 24
PAGE_SIZE = 100  # Supabase storage.list default cap — must paginate past it


def _list_all(storage, prefix: str) -> list:
    """Page through storage.list — it silently caps at PAGE_SIZE otherwise,
    which would leave older photos undeleted (an RGPD gap)."""
    out: list = []
    offset = 0
    while True:
        page = storage.list(prefix, {"limit": PAGE_SIZE, "offset": offset})
        if not page:
            break
        out.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return out


def _parse_created_at(value: str | None) -> datetime.datetime | None:
    if not value:
        return None
    # Supabase returns ISO 8601, sometimes with a trailing Z.
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def sweep_orphans() -> int:
    """Delete photos older than MAX_AGE_HOURS across all profile folders.
    Returns the number of objects removed."""
    admin = get_supabase_admin()
    storage = admin.storage.from_(BUCKET)
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(
        hours=MAX_AGE_HOURS
    )
    removed = 0

    # Top level lists per-profile folders; files live one level down.
    folders = _list_all(storage, "")
    for folder in folders:
        folder_name = folder["name"] if isinstance(folder, dict) else folder.name
        files = _list_all(storage, folder_name)
        stale = []
        for f in files:
            meta = f if isinstance(f, dict) else f.__dict__
            created = _parse_created_at(meta.get("created_at"))
            if created is not None and created < cutoff:
                stale.append(f"{folder_name}/{meta['name']}")
        if stale:
            storage.remove(stale)
            removed += len(stale)

    return removed
