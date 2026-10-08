"""Traduction des refus de quota en réponses HTTP.

Regroupé ici parce que six routes font exactement la même chose, et parce que
les deux refus n'ont pas le même sens pour l'utilisateur :

- 402 : la fonctionnalité est fermée à son palier — l'inviter à s'abonner.
- 429 : son enveloppe du mois est épuisée — lui dire quand elle se recharge.

Dire « réessaie le mois prochain » à quelqu'un qui n'aura jamais accès à la
fonctionnalité est la pire des deux erreurs possibles.

Les textes viennent de `errors.py` : ce sont les deux messages qui précèdent
immédiatement un abonnement, et les lire dans une langue étrangère ne donne
pas envie de payer.
"""
from fastapi import HTTPException, status

from app import errors
from app.lang import FR
from app.services import quota
from app.services.plan import PREMIUM_PRICE_EUR, PremiumRequired
from app.services.quota import QuotaExceeded


def consume(profile_id: str, kind: str, lang: str = FR) -> None:
    """Consomme une unité de quota, ou lève la HTTPException qui convient."""
    try:
        quota.consume(profile_id, kind)
    except PremiumRequired as exc:
        # `trial_ends_at` est NOT NULL avec une valeur par défaut : tout compte
        # a donc eu son essai, et être au palier gratuit signifie forcément
        # qu'il est terminé. Inutile d'interroger la base pour le confirmer —
        # et rappeler ce qu'on vient de perdre convertit mieux qu'une phrase
        # générique.
        fonctionnalite = errors.FONCTIONNALITES.get(
            exc.feature, errors.FONCTIONNALITES["_defaut"]
        )
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=errors.texte(
                errors.ESSAI_TERMINE,
                lang,
                fonctionnalite=errors.texte(fonctionnalite, lang),
                prix=PREMIUM_PRICE_EUR,
            ),
        )
    except QuotaExceeded as exc:
        label = errors.LABELS.get(kind)
        suite = (
            errors.QUOTA_SUITE_GRATUIT
            if exc.plan == "free"
            else errors.QUOTA_SUITE_PAYANT
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=errors.texte(
                errors.QUOTA,
                lang,
                limite=exc.limit,
                # Une catégorie inconnue vaut mieux affichée telle quelle
                # qu'omise : le message reste compréhensible.
                label=errors.texte(label, lang) if label else kind,
            )
            + errors.texte(suite, lang),
        )
