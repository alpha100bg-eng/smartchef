from pydantic import BaseModel, Field

SLOTS = ("breakfast", "lunch", "dinner", "snack")


class Macros(BaseModel):
    kcal: float | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None


class PlanIngredient(BaseModel):
    name: str
    quantity: float | None = None
    unit: str | None = None


class PlanRecipeDraft(BaseModel):
    """Ce que le modèle produit à la génération du plan — sans la préparation.

    Les instructions représentaient ~74 % des tokens de sortie : 13 239 au
    total, contre un plafond de 16 000, ce qui tronquait le JSON par
    intermittence. Elles sont désormais rédigées à la demande, recette par
    recette (voir `recipe_instructions`).

    Les ingrédients, eux, restent générés ici : la liste de courses les agrège
    depuis la base pour toute la semaine, y compris les recettes jamais
    ouvertes.
    """

    title: str
    prep_time_min: int | None = None
    servings: int | None = None
    macros: Macros = Field(default_factory=Macros)
    ingredients: list[PlanIngredient]


class PlanRecipe(PlanRecipeDraft):
    """Ce que l'API renvoie. `instructions` est vide tant que l'utilisateur
    n'a pas ouvert la recette."""

    instructions: str = ""


class ScheduleEntry(BaseModel):
    day_offset: int = Field(description="0 = week_start, up to 6")
    slot: str = Field(description="breakfast | lunch | dinner | snack")
    recipe_index: int = Field(description="index into the recipes list")


class MealPlanGeneration(BaseModel):
    """Raw LLM output: deduped recipes + a schedule mapping into them."""

    recipes: list[PlanRecipeDraft]
    schedule: list[ScheduleEntry]
    estimated_cost: float | None = None


class RecipeSteps(BaseModel):
    """Préparation d'une recette, rédigée à la demande."""

    steps: list[str] = Field(description="4 à 7 étapes concrètes et cuisinables")


# ── API response shapes ──────────────────────────────────────────────
class MealPlanEntryView(BaseModel):
    day: str
    slot: str
    # Nécessaire au front pour demander la préparation de CETTE recette.
    recipe_id: str
    recipe: PlanRecipe


class MealPlanView(BaseModel):
    id: str
    week_start: str
    budget_target: float | None = None
    estimated_cost: float | None = None
    entries: list[MealPlanEntryView]


class GenerateRequest(BaseModel):
    week_start: str  # ISO date, the Monday of the target week
    budget: float | None = None


class InstructionsRequest(BaseModel):
    recipe_id: str


class InstructionsResponse(BaseModel):
    instructions: str
