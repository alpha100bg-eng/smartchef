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

FEATURE_NAMES = {
    "meal_plan": "Le plan de la semaine",
    "shopping": "La liste de courses",
}


def consume(profile_id: str, kind: str) -> None:
    """Consomme une unité de quota, ou lève la HTTPException qui convient."""
    try:
        quota.consume(profile_id, kind)
    except PremiumRequired as exc:
        # `trial_ends_at` est NOT NULL avec une valeur par défaut : tout compte
        # a donc eu son essai, et être au palier gratuit signifie forcément
        # qu'il est terminé. Inutile d'interroger la base pour le confirmer —
        # et rappeler ce qu'on vient de perdre convertit mieux qu'une phrase
        # générique.
        nom = FEATURE_NAMES.get(exc.feature, "Cette fonctionnalité")
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"Ton essai est terminé. {nom} reste disponible avec Premium "
                f"({PREMIUM_PRICE_EUR} €/mois)."
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
