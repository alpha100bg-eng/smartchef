"""Durée de conservation d'aliments désignés par leur nom (sans photo).

La vision estime déjà `shelf_life_days` pour ce qu'elle voit dans le frigo.
Les articles qui arrivent par la liste de courses n'ont pas d'image : sans ce
service, ils entreraient dans l'inventaire sans date et échapperaient aux
alertes de péremption — la moitié du frigo deviendrait invisible au fil des
semaines.

Tier bon marché : c'est de la classification, pas du raisonnement (spec §
choix de modèle).
"""
from datetime import date, timedelta
from functools import lru_cache

from anthropic import Anthropic
from pydantic import BaseModel, Field

from app.core.config import settings

SHELF_LIFE_MODEL = "claude-haiku-4-5"

MIN_DAYS = 1
MAX_DAYS = 365

# Préfixe stable — mis en cache (spec : prompt caching obligatoire).
SYSTEM_PROMPT = (
    "Tu estimes la durée de conservation d'aliments AU RÉFRIGÉRATEUR, en jours, "
    "à partir de leur nom, pour un produit frais qui vient d'être acheté et qui "
    "n'a pas encore été ouvert.\n"
    "Repères : herbes fraîches et salade lavée 3-5 ; viande et poisson crus 2-3 ; "
    "lait, légumes-feuilles 7 ; yaourts, fromage frais 14 ; légumes racines, "
    "fromage à pâte dure 30 ; œufs 28.\n"
    "Renvoie null pour ce qui ne se périme pas en pratique : condiments, épices, "
    "conserves, pâtes et riz secs, sucre, farine.\n"
    "Réponds pour CHAQUE nom fourni, en reprenant le nom à l'identique."
)


class ShelfLife(BaseModel):
    name: str = Field(description="Le nom reçu, recopié tel quel")
    days: int | None = Field(description="Jours de conservation, null si non périssable")


class ShelfLifeResult(BaseModel):
    items: list[ShelfLife]


@lru_cache
def _client() -> Anthropic:
    return Anthropic(
        api_key=settings.anthropic_api_key,
        timeout=settings.ai_timeout_seconds,
        max_retries=2,
    )


def to_expiry_dates(
    result: ShelfLifeResult, today: date | None = None
) -> dict[str, str | None]:
    """Convertit les durées en dates ISO, bornées comme côté vision."""
    today = today or date.today()
    dates: dict[str, str | None] = {}
    for item in result.items:
        if item.days is None:
            dates[item.name] = None
            continue
        days = max(MIN_DAYS, min(MAX_DAYS, item.days))
        dates[item.name] = (today + timedelta(days=days)).isoformat()
    return dates


def estimate(names: list[str]) -> dict[str, str | None]:
    """Nom d'aliment -> date de péremption estimée (ISO), ou None.

    Les noms absents de la réponse sont simplement absents du dictionnaire :
    l'appelant insère alors sans date plutôt que d'inventer.
    """
    if not names:
        return {}
    response = _client().messages.parse(
        model=SHELF_LIFE_MODEL,
        max_tokens=1500,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": "\n".join(names)}],
        output_format=ShelfLifeResult,
    )
    return to_expiry_dates(response.parsed_output)
