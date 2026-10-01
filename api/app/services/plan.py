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
TRIAL = "trial"
PREMIUM = "premium"

TRIAL_DAYS = 7


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
    # L'essai donne l'accès complet : son but est précisément de faire vivre
    # le plan de repas, qu'un compte gratuit ne verrait jamais.
    TRIAL: Limits(vision=100, search=300, meal_plan=8, shopping=40),
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


def _parse(ts) -> "datetime | None":
    from datetime import datetime

    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        return None


def trial_ends_at(profile_id: str) -> "datetime | None":
    row = (
        get_supabase_admin()
        .table("profiles")
        .select("trial_ends_at")
        .eq("id", profile_id)
        .single()
        .execute()
    )
    return _parse((row.data or {}).get("trial_ends_at"))


def current_plan(profile_id: str) -> str:
    """Palier effectif : `premium`, `trial` ou `free`.

    Un abonnement payé prime sur l'essai. Une période payée expirée redevient
    gratuite même si la colonne `plan` n'a pas encore été remise à jour par le
    webhook : la date fait foi, pas la colonne.
    """
    from datetime import datetime, timezone

    row = (
        get_supabase_admin()
        .table("profiles")
        .select("plan, premium_until, trial_ends_at")
        .eq("id", profile_id)
        .single()
        .execute()
    )
    data = row.data or {}
    now = datetime.now(timezone.utc)

    if data.get("plan") == PREMIUM:
        until = _parse(data.get("premium_until"))
        # Date absente ou illisible : ne pas punir quelqu'un qui paie.
        if until is None or until >= now:
            return PREMIUM

    ends = _parse(data.get("trial_ends_at"))
    if ends is not None and ends > now:
        return TRIAL

    return FREE


def trial_days_left(ends: "datetime | None") -> int:
    """Jours entiers restants, arrondis au supérieur : le dernier jour affiche
    « 1 jour » plutôt que « 0 »."""
    from datetime import datetime, timezone
    import math

    if ends is None:
        return 0
    delta = ends - datetime.now(timezone.utc)
    return max(0, math.ceil(delta.total_seconds() / 86400))


def limits_for(plan: str) -> Limits:
    return LIMITS.get(plan, LIMITS[FREE])


def limit_of(plan: str, kind: str) -> int:
    return getattr(limits_for(plan), kind, 0)
