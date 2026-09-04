"""Traduction des refus de quota en réponses HTTP.

Regroupé ici parce que six routes font exactement la même chose, et parce que
les deux refus n'ont pas le même sens pour l'utilisateur :

- 402 : la fonctionnalité est fermée à son palier — l'inviter à s'abonner.
- 429 : son enveloppe du mois est épuisée — lui dire quand elle se recharge.

Dire « réessaie le mois prochain » à quelqu'un qui n'aura jamais accès à la
fonctionnalité est la pire des deux erreurs possibles.
"""
from fastapi import HTTPException, status

from app.services import quota
from app.services.plan import PREMIUM_PRICE_EUR, PremiumRequired
from app.services.quota import QuotaExceeded

# Libellés au pluriel, tels qu'ils apparaissent dans le message.
LABELS = {
    "vision": "scans",
    "search": "recherches",
    "meal_plan": "plans de repas",
    "shopping": "listes de courses",
}

PREMIUM_MESSAGES = {
    "meal_plan": (
        f"Le plan de la semaine fait partie de Premium ({PREMIUM_PRICE_EUR} €/mois)."
    ),
    "shopping": (
        f"La liste de courses fait partie de Premium ({PREMIUM_PRICE_EUR} €/mois)."
    ),
}


def consume(profile_id: str, kind: str) -> None:
    """Consomme une unité de quota, ou lève la HTTPException qui convient."""
    try:
        quota.consume(profile_id, kind)
    except PremiumRequired:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=PREMIUM_MESSAGES.get(
                kind, f"Cette fonctionnalité fait partie de Premium ({PREMIUM_PRICE_EUR} €/mois)."
            ),
        )
    except QuotaExceeded as exc:
        label = LABELS.get(kind, kind)
        suffix = (
            " Passe en Premium pour en avoir plus."
            if exc.plan == "free"
            else " Le compteur repart le 1er du mois."
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Tu as utilisé tes {exc.limit} {label} du mois.{suffix}",
        )
