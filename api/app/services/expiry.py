"""Expiry alerts (F4) — notify users about food about to expire.

Runs as a cron job (POST /jobs/expiry-check, CRON_SECRET-protected). Selects
inventory items expiring within EXPIRY_WINDOW_DAYS that were never notified for
their current expiry_date, sends one Expo push per profile, and stamps
expiry_notified_at so nothing is notified twice.

Anti-spam rearm is handled in the DB: a trigger clears expiry_notified_at
whenever expiry_date changes (see migration 0005).
"""
import datetime

import httpx

from app.core.supabase_client import get_supabase_admin

EXPIRY_WINDOW_DAYS = 3
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
PUSH_TIMEOUT_SECONDS = 15
EXPO_BATCH_SIZE = 100  # Expo's documented per-request limit


def _due_items(admin, today: datetime.date) -> list[dict]:
    horizon = today + datetime.timedelta(days=EXPIRY_WINDOW_DAYS)
    result = (
        admin.table("inventory_items")
        .select("id, profile_id, name, expiry_date")
        .is_("expiry_notified_at", "null")
        .gte("expiry_date", today.isoformat())
        .lte("expiry_date", horizon.isoformat())
        .execute()
    )
    return result.data or []


def _tokens_by_profile(admin, profile_ids: list[str]) -> dict[str, list[str]]:
    if not profile_ids:
        return {}
    result = (
        admin.table("push_tokens")
        .select("profile_id, token")
        .in_("profile_id", profile_ids)
        .execute()
    )
    by_profile: dict[str, list[str]] = {}
    for row in result.data or []:
        by_profile.setdefault(row["profile_id"], []).append(row["token"])
    return by_profile


def _build_message(token: str, names: list[str]) -> dict:
    """One notification per profile. Deep-links into the existing search screen
    so the user immediately sees recipes using the expiring food (F5 reuse)."""
    first = names[0]
    if len(names) == 1:
        body = f"{first} arrive à expiration. Voici quoi cuisiner."
    else:
        body = f"{first} et {len(names) - 1} autre(s) aliment(s) arrivent à expiration."
    return {
        "to": token,
        "title": "À consommer bientôt",
        "body": body,
        "data": {"item_name": first, "url": f"smartchef://search?q={first}"},
    }


def _send(messages: list[dict]) -> None:
    """Expo accepts at most EXPO_BATCH_SIZE messages per request, so send in
    chunks. Sending one oversized request would fail the whole run and leave
    every item unstamped — everyone would be re-notified the next day."""
    for start in range(0, len(messages), EXPO_BATCH_SIZE):
        chunk = messages[start : start + EXPO_BATCH_SIZE]
        response = httpx.post(
            EXPO_PUSH_URL,
            json=chunk,
            headers={"Content-Type": "application/json"},
            timeout=PUSH_TIMEOUT_SECONDS,
        )
        response.raise_for_status()


def run_expiry_check(today: datetime.date | None = None) -> dict:
    """Returns a summary: items considered, profiles notified, pushes sent."""
    admin = get_supabase_admin()
    today = today or datetime.date.today()

    items = _due_items(admin, today)
    if not items:
        return {"items": 0, "profiles_notified": 0, "pushes_sent": 0}

    by_profile: dict[str, list[dict]] = {}
    for item in items:
        by_profile.setdefault(item["profile_id"], []).append(item)

    tokens = _tokens_by_profile(admin, list(by_profile))

    messages: list[dict] = []
    notified_item_ids: list[str] = []
    profiles_notified = 0
    for profile_id, profile_items in by_profile.items():
        profile_tokens = tokens.get(profile_id)
        if not profile_tokens:
            continue  # no consent / no registered device — skip, do not stamp
        names = [i["name"] for i in profile_items]
        messages.extend(_build_message(t, names) for t in profile_tokens)
        notified_item_ids.extend(i["id"] for i in profile_items)
        profiles_notified += 1

    _send(messages)

    if notified_item_ids:
        stamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        admin.table("inventory_items").update({"expiry_notified_at": stamp}).in_(
            "id", notified_item_ids
        ).execute()

    return {
        "items": len(items),
        "profiles_notified": profiles_notified,
        "pushes_sent": len(messages),
    }
