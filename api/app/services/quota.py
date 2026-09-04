"""Quotas IA mensuels, par utilisateur et par palier (spec §9).

Le comptage se fait dans Postgres (`consume_ai_quota_period`) pour que deux
requêtes simultanées ne puissent pas passer toutes les deux : un read-then-write
en Python le permettrait.

Mensuel et non quotidien : un plafond quotidien borne mal un coût mensuel
(2 plans/jour = 60 par mois), et c'est le coût mensuel qui décide de ce que
l'app peut supporter.
"""
from app.core.supabase_client import get_supabase_admin
from app.services import plan as plan_svc


class QuotaExceeded(Exception):
    """Le palier de l'appelant permet cette action, mais son enveloppe du mois
    est épuisée."""

    def __init__(self, kind: str, limit: int, plan: str):
        self.kind = kind
        self.limit = limit
        self.plan = plan
        super().__init__(f"quota exceeded for {kind} ({limit}/month, {plan})")


def consume(profile_id: str, kind: str) -> None:
    """Consomme une unité, ou lève.

    - `PremiumRequired` si la fonctionnalité est fermée au palier (limite 0) :
      inviter à s'abonner, pas à revenir le mois prochain.
    - `QuotaExceeded` si l'enveloppe du mois est épuisée.
    """
    current = plan_svc.current_plan(profile_id)
    limit = plan_svc.limit_of(current, kind)

    if limit <= 0:
        raise plan_svc.PremiumRequired(kind)

    allowed = (
        get_supabase_admin()
        .rpc(
            "consume_ai_quota_period",
            {
                "p_profile_id": profile_id,
                "p_kind": kind,
                "p_limit": limit,
                "p_monthly": True,
            },
        )
        .execute()
    )
    if not allowed.data:
        raise QuotaExceeded(kind, limit, current)


def usage_this_month(profile_id: str) -> dict[str, int]:
    """Consommation du mois par type, pour afficher ce qu'il reste."""
    rows = (
        get_supabase_admin()
        .rpc("ai_usage_this_month", {"p_profile_id": profile_id})
        .execute()
    )
    return {r["kind"]: r["used"] for r in (rows.data or [])}
