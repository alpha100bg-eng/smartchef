"""Daily AI quota per user (spec §9).

Each AI endpoint consumes one unit of its own bucket. Counting happens inside
Postgres (`consume_ai_quota`) so two concurrent requests can't both slip past
the limit — a read-then-write in Python would allow exactly that.
"""
from app.core.config import settings
from app.core.supabase_client import get_supabase_admin


class QuotaExceeded(Exception):
    """Raised when the caller has used up today's allowance for a bucket."""

    def __init__(self, kind: str, limit: int):
        self.kind = kind
        self.limit = limit
        super().__init__(f"quota exceeded for {kind} ({limit}/day)")


def limit_for(kind: str) -> int:
    return {
        "vision": settings.quota_vision_per_day,
        "search": settings.quota_search_per_day,
        "meal_plan": settings.quota_meal_plan_per_day,
        "shopping": settings.quota_shopping_per_day,
    }.get(kind, 0)


def consume(profile_id: str, kind: str) -> None:
    """Consume one unit or raise QuotaExceeded. Call before the AI request."""
    limit = limit_for(kind)
    allowed = (
        get_supabase_admin()
        .rpc(
            "consume_ai_quota",
            {"p_profile_id": profile_id, "p_kind": kind, "p_limit": limit},
        )
        .execute()
    )
    if not allowed.data:
        raise QuotaExceeded(kind, limit)
