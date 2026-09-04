"""Paliers d'abonnement et quotas mensuels associés.

Le coût mesuré est de ~1 €/mois par utilisateur régulier. Les quotas ne sont
donc pas décoratifs : ils sont ce qui rend la croissance finançable.

Le plan de repas (6,90 ¢ l'appel, dix fois une recherche) est réservé au
Premium — c'est à la fois la fonctionnalité la plus chère et la plus
convaincante. La liste de courses le suit : elle se construit à partir d'un
plan, un gratuit n'en aurait aucun.
"""
from dataclasses import dataclass

from app.core.supabase_client import get_supabase_admin

FREE = "free"
PREMIUM = "premium"


@dataclass(frozen=True)
class Limits:
    """Quotas MENSUELS. 0 = fonctionnalité fermée à ce palier."""

    vision: int
    search: int
    meal_plan: int
    shopping: int


# Gratuit : de quoi juger le produit sur un vrai mois d'usage, pas une démo.
# Premium : au-delà de tout usage réel mesuré (8 scans, 20 recherches et
# 4 plans par mois pour un utilisateur régulier), donc jamais gênant, tout en
# bornant le coût à ~2,50 € par abonné dans le pire des cas.
LIMITS = {
    FREE: Limits(vision=3, search=10, meal_plan=0, shopping=0),
    PREMIUM: Limits(vision=100, search=300, meal_plan=8, shopping=40),
}

PREMIUM_PRICE_EUR = "4,99"


class PremiumRequired(Exception):
    """Fonctionnalité fermée au palier gratuit — distinct d'un quota épuisé.

    Le message doit être différent : « repasse le mois prochain » n'a aucun
    sens pour quelque chose qui ne s'ouvrira jamais sans abonnement.
    """

    def __init__(self, feature: str):
        self.feature = feature
        super().__init__(f"{feature} requires premium")


def current_plan(profile_id: str) -> str:
    """Palier effectif. Une période payée expirée redevient gratuite, même si
    la colonne `plan` n'a pas encore été remise à jour par le webhook."""
    row = (
        get_supabase_admin()
        .table("profiles")
        .select("plan, premium_until")
        .eq("id", profile_id)
        .single()
        .execute()
    )
    data = row.data or {}
    if data.get("plan") != PREMIUM:
        return FREE

    until = data.get("premium_until")
    if until:
        from datetime import datetime, timezone

        try:
            end = datetime.fromisoformat(str(until).replace("Z", "+00:00"))
        except ValueError:
            return PREMIUM  # date illisible : ne pas punir un abonné payant
        if end < datetime.now(timezone.utc):
            return FREE
    return PREMIUM


def limits_for(plan: str) -> Limits:
    return LIMITS.get(plan, LIMITS[FREE])


def limit_of(plan: str, kind: str) -> int:
    return getattr(limits_for(plan), kind, 0)
