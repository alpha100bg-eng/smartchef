"""Meal-plan service — generate a weekly plan (F2, spec §7.2).

Sonnet 5 (complex reasoning: budget, 28 slots, macros, expiry prioritisation).
The LLM returns deduped recipes + a schedule; we persist recipes/ingredients/
plan/entries (service key, scoped to profile_id) and return a view.
"""
import datetime
import json
from functools import lru_cache

from anthropic import Anthropic

from app.core.config import settings
from app.core.supabase_client import get_supabase_admin
from app.models.meal_plan import (
    MealPlanEntryView,
    MealPlanGeneration,
    MealPlanView,
    PlanRecipe,
    RecipeSteps,
    SLOTS,
)
from app.services.search import load_context

MEAL_PLAN_MODEL = "claude-sonnet-5"

SYSTEM_PROMPT = (
    "Tu es un planificateur de repas. Génère un plan pour 7 jours et 4 créneaux "
    "(breakfast, lunch, dinner, snack), soit 28 créneaux. Règles : "
    "(1) respecte STRICTEMENT le régime et les ALLERGIES ; "
    "(2) priorise les aliments déjà dans l'inventaire, surtout ceux bientôt "
    "périmés ; (3) respecte le budget hebdomadaire indiqué et estime le coût "
    "total (`estimated_cost`, en euros) ; (4) varie les recettes mais tu peux "
    "réutiliser une recette sur plusieurs créneaux (ex. petit-déjeuner) — "
    "renvoie une liste `recipes` dédupliquée et un `schedule` qui y fait "
    "référence par `recipe_index`, `day_offset` (0-6) et `slot`. Donne des "
    "macros estimées par recette. Réutilise les recettes du petit-déjeuner et "
    "des collations d'un jour sur l'autre pour rester sous une quinzaine de "
    "recettes distinctes.\n\n"
    "IMPORTANT : n'écris PAS la préparation. Pour chaque recette, uniquement le "
    "titre, le temps, les portions, les macros et la liste d'ingrédients avec "
    "des quantités précises — ces ingrédients servent à bâtir la liste de "
    "courses de toute la semaine, y compris pour les recettes que "
    "l'utilisateur n'ouvrira pas."
)

# Rédigée à la demande, une recette à la fois. Même exigence de qualité que la
# fiche recette de la recherche : c'est ce que l'utilisateur lit en cuisinant.
STEPS_PROMPT = (
    "Tu es un chef qui rédige la préparation d'une recette. On te donne son "
    "titre, ses ingrédients et le contexte de l'utilisateur (régime, "
    "allergies). Écris 4 à 7 étapes concrètes et cuisinables, avec "
    "températures, durées, textures et indices sensoriels (« jusqu'à ce que "
    "les oignons soient translucides »). Jamais d'étape vague du type "
    "« cuire » ou « mélanger le tout ». Respecte STRICTEMENT le régime et les "
    "ALLERGIES."
)


@lru_cache
def _client() -> Anthropic:
    return Anthropic(api_key=settings.anthropic_api_key, timeout=settings.ai_timeout_seconds, max_retries=2)


def _generate(profile_id: str, week_start: str, budget: float | None) -> MealPlanGeneration:
    context = load_context(profile_id)
    if budget is not None:
        context["budget_weekly"] = budget
    user_content = (
        f"Semaine du {week_start}.\n"
        f"Contexte (JSON) :\n{json.dumps(context, ensure_ascii=False)}"
    )
    resp = _client().messages.parse(
        model=MEAL_PLAN_MODEL,
        # Sans les préparations, la sortie mesurée tombe à ~3 500 tokens ;
        # 8 000 laisse plus du double de marge, là où 16 000 était atteint.
        max_tokens=8000,
        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_content}],
        output_format=MealPlanGeneration,
    )
    return resp.parsed_output


def _persist(profile_id: str, week_start: str, budget: float | None, gen: MealPlanGeneration) -> str:
    """Insert recipes/ingredients/plan/entries; return the meal_plan id.
    Best-effort cleanup on failure (service key bypasses RLS)."""
    admin = get_supabase_admin()
    recipe_ids: list[str] = []
    plan_id: str | None = None
    try:
        for r in gen.recipes:
            row = admin.table("recipes").insert({
                "profile_id": profile_id,
                "title": r.title,
                # Rédigée à la première ouverture, puis conservée.
                "instructions": None,
                "prep_time_min": r.prep_time_min,
                "servings": r.servings,
                "macros": r.macros.model_dump(),
                "generated_by_ai": True,
            }).execute()
            rid = row.data[0]["id"]
            recipe_ids.append(rid)
            if r.ingredients:
                admin.table("recipe_ingredients").insert([
                    {"recipe_id": rid, "name": ing.name, "quantity": ing.quantity, "unit": ing.unit}
                    for ing in r.ingredients
                ]).execute()

        plan = admin.table("meal_plans").insert({
            "profile_id": profile_id,
            "week_start": week_start,
            "budget_target": budget,
            "estimated_cost": gen.estimated_cost,
        }).execute()
        plan_id = plan.data[0]["id"]

        base = datetime.date.fromisoformat(week_start)
        entries = []
        for s in gen.schedule:
            if s.slot not in SLOTS or not (0 <= s.recipe_index < len(recipe_ids)):
                continue  # skip malformed entries rather than fail the whole plan
            entries.append({
                "meal_plan_id": plan_id,
                "day": (base + datetime.timedelta(days=s.day_offset)).isoformat(),
                "slot": s.slot,
                "recipe_id": recipe_ids[s.recipe_index],
            })
        if entries:
            admin.table("meal_plan_entries").insert(entries).execute()
        return plan_id
    except Exception:
        if plan_id:
            admin.table("meal_plans").delete().eq("id", plan_id).execute()
        for rid in recipe_ids:
            admin.table("recipes").delete().eq("id", rid).execute()
        raise


def _view(profile_id: str, plan_id: str) -> MealPlanView:
    admin = get_supabase_admin()
    plan = admin.table("meal_plans").select("*").eq("id", plan_id).single().execute()
    if not plan.data or plan.data["profile_id"] != profile_id:
        raise LookupError("meal plan not found")

    entries = (
        admin.table("meal_plan_entries")
        .select("day, slot, recipe_id")
        .eq("meal_plan_id", plan_id)
        .order("day")
        .execute()
    )
    # Fetch recipes and ingredients in two bulk queries instead of two per
    # entry — a 28-slot week was issuing ~57 round trips.
    rows = entries.data or []
    recipe_ids = list({e["recipe_id"] for e in rows})

    recipes_by_id: dict[str, dict] = {}
    ingredients_by_recipe: dict[str, list] = {}
    if recipe_ids:
        recipes = admin.table("recipes").select("*").in_("id", recipe_ids).execute()
        recipes_by_id = {r["id"]: r for r in (recipes.data or [])}
        ings = (
            admin.table("recipe_ingredients")
            .select("recipe_id, name, quantity, unit")
            .in_("recipe_id", recipe_ids)
            .execute()
        )
        for ing in ings.data or []:
            ingredients_by_recipe.setdefault(ing["recipe_id"], []).append(
                {"name": ing["name"], "quantity": ing.get("quantity"), "unit": ing.get("unit")}
            )

    views: list[MealPlanEntryView] = []
    for e in rows:
        rd = recipes_by_id.get(e["recipe_id"])
        if rd is None:
            continue  # recipe removed out from under the plan
        views.append(MealPlanEntryView(
            day=e["day"],
            slot=e["slot"],
            recipe_id=e["recipe_id"],
            recipe=PlanRecipe(
                title=rd["title"],
                prep_time_min=rd.get("prep_time_min"),
                servings=rd.get("servings"),
                macros=rd.get("macros") or {},
                ingredients=ingredients_by_recipe.get(e["recipe_id"], []),
                instructions=rd.get("instructions") or "",
            ),
        ))
    return MealPlanView(
        id=plan_id,
        week_start=str(plan.data["week_start"]),
        budget_target=plan.data.get("budget_target"),
        estimated_cost=plan.data.get("estimated_cost"),
        entries=views,
    )


def recipe_instructions(profile_id: str, recipe_id: str) -> str:
    """Rédige la préparation d'une recette du plan, à la première ouverture.

    Le résultat est écrit en base : rouvrir la même recette ne coûte plus rien.
    Renvoie directement le texte déjà stocké s'il existe.
    """
    admin = get_supabase_admin()
    row = (
        admin.table("recipes")
        .select("id, profile_id, title, instructions")
        .eq("id", recipe_id)
        .single()
        .execute()
    )
    # La clé de service contourne la RLS : vérifier l'appartenance ici est la
    # seule barrière entre deux comptes.
    if not row.data or row.data["profile_id"] != profile_id:
        raise LookupError("recipe not found")
    if row.data.get("instructions"):
        return row.data["instructions"]

    ings = (
        admin.table("recipe_ingredients")
        .select("name, quantity, unit")
        .eq("recipe_id", recipe_id)
        .execute()
    )
    context = load_context(profile_id)
    payload = {
        "titre": row.data["title"],
        "ingredients": ings.data or [],
        "regime": context["profile"].get("diet_type"),
        "allergies": context["allergies"],
    }
    resp = _client().messages.parse(
        model=MEAL_PLAN_MODEL,
        max_tokens=1500,
        system=[{"type": "text", "text": STEPS_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
        output_format=RecipeSteps,
    )
    steps = [s.strip() for s in resp.parsed_output.steps if s.strip()]
    if not steps:
        raise RuntimeError("empty instructions returned")

    text = "\n".join(f"{i}. {s}" for i, s in enumerate(steps, 1))
    admin.table("recipes").update({"instructions": text}).eq("id", recipe_id).execute()
    return text


def generate_meal_plan(profile_id: str, week_start: str, budget: float | None) -> MealPlanView:
    gen = _generate(profile_id, week_start, budget)
    plan_id = _persist(profile_id, week_start, budget, gen)
    return _view(profile_id, plan_id)


def get_meal_plan(profile_id: str, plan_id: str) -> MealPlanView:
    return _view(profile_id, plan_id)
