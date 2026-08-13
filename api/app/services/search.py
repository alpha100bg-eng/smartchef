"""Recipe search service — natural-language query → recipes (F5, spec §7.3).

Prototype model: Claude Sonnet 5, structured JSON output, prompt caching on the
system prompt. Reads the user's current inventory + profile (diet, allergies) so
results are coherent with what they have and safe for their constraints.
Measure Haiku 4.5 later and downgrade if quality holds (same as vision).
"""
import json
from functools import lru_cache

from anthropic import Anthropic

from app.core.config import settings
from app.core.supabase_client import get_supabase_admin
from app.models.recipe import Recipe, RecipeSummary, SearchResult

SEARCH_MODEL = "claude-sonnet-5"

# Two-step design: listing 10 fully-detailed recipes took ~80s and ~12 cents.
# We list summaries first (fast, cheap) and generate the full recipe only for
# the one the user actually opens.
SYSTEM_PROMPT = (
    "Tu es un assistant culinaire. À partir d'une requête libre de l'utilisateur "
    "et du contexte fourni (inventaire du frigo, régime, allergies), propose des "
    "IDÉES de recettes. Règles : (1) respecte STRICTEMENT le régime et surtout "
    "les ALLERGIES — n'utilise jamais un aliment allergène ; (2) priorise les "
    "ingrédients déjà présents dans l'inventaire quand c'est cohérent, et "
    "liste-les dans `uses_inventory` ; (3) reste fidèle à la requête (cuisine, "
    "temps, ingrédients demandés) ; (4) propose 10 recettes VARIÉES — évite "
    "plusieurs déclinaisons du même plat. "
    "IMPORTANT : ne donne PAS les ingrédients ni les étapes ici. Pour chaque "
    "recette, uniquement un titre appétissant, un `teaser` d'UNE phrase qui "
    "donne envie, le temps de préparation, le nombre de portions et les "
    "aliments du frigo utilisés."
)

DETAIL_PROMPT = (
    "Tu es un chef qui rédige une fiche recette. On te donne un titre, une "
    "courte description et le contexte de l'utilisateur (inventaire, régime, "
    "allergies). Rédige la recette complète. Règles : respecte STRICTEMENT le "
    "régime et les ALLERGIES ; priorise les aliments de l'inventaire et "
    "liste-les dans `uses_inventory`. "
    "Qualité : écris comme un vrai livre de cuisine, pas comme un pense-bête. "
    "Donne des quantités précises pour chaque ingrédient, et 5 à 9 étapes "
    "détaillées avec températures, durées, textures et indices sensoriels "
    "(« jusqu'à ce que les oignons soient translucides »). Ajoute une astuce ou "
    "une variante quand c'est pertinent. Jamais d'étape vague du type « cuire » "
    "ou « mélanger le tout »."
)


@lru_cache
def _client() -> Anthropic:
    return Anthropic(api_key=settings.anthropic_api_key, timeout=settings.ai_timeout_seconds, max_retries=2)


def load_context(profile_id: str) -> dict:
    """Inventory + profile + allergies for the caller. Shared with meal_plan."""
    admin = get_supabase_admin()
    inventory = (
        admin.table("inventory_items")
        .select("name, quantity, unit")
        .eq("profile_id", profile_id)
        .execute()
    )
    profile = (
        admin.table("profiles")
        .select("diet_type, budget_weekly, time_per_meal_min")
        .eq("id", profile_id)
        .single()
        .execute()
    )
    allergies = (
        admin.table("allergies")
        .select("label")
        .eq("profile_id", profile_id)
        .execute()
    )
    return {
        "inventory": inventory.data or [],
        "profile": profile.data or {},
        "allergies": [a["label"] for a in (allergies.data or [])],
    }


def search_recipes(profile_id: str, query: str) -> SearchResult:
    context = load_context(profile_id)
    user_content = (
        f"Requête : {query}\n\n"
        f"Contexte (JSON) :\n{json.dumps(context, ensure_ascii=False)}"
    )
    response = _client().messages.parse(
        model=SEARCH_MODEL,
        # Summaries only — 10 titles + teasers fit comfortably here.
        max_tokens=3000,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_content}],
        output_format=SearchResult,
    )
    return response.parsed_output


def recipe_detail(profile_id: str, title: str, teaser: str = "") -> Recipe:
    """Generate the full recipe for one title, on demand. Keeps the listing
    fast and means we only pay for recipes the user actually opens."""
    context = load_context(profile_id)
    user_content = (
        f"Recette : {title}\n"
        f"Description : {teaser}\n\n"
        f"Contexte (JSON) :\n{json.dumps(context, ensure_ascii=False)}"
    )
    response = _client().messages.parse(
        model=SEARCH_MODEL,
        max_tokens=4000,
        system=[
            {
                "type": "text",
                "text": DETAIL_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_content}],
        output_format=Recipe,
    )
    return response.parsed_output
