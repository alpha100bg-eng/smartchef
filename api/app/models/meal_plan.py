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


class PlanRecipe(BaseModel):
    title: str
    prep_time_min: int | None = None
    servings: int | None = None
    macros: Macros = Field(default_factory=Macros)
    ingredients: list[PlanIngredient]
    instructions: str


class ScheduleEntry(BaseModel):
    day_offset: int = Field(description="0 = week_start, up to 6")
    slot: str = Field(description="breakfast | lunch | dinner | snack")
    recipe_index: int = Field(description="index into the recipes list")


class MealPlanGeneration(BaseModel):
    """Raw LLM output: deduped recipes + a schedule mapping into them."""

    recipes: list[PlanRecipe]
    schedule: list[ScheduleEntry]
    estimated_cost: float | None = None


# ── API response shapes ──────────────────────────────────────────────
class MealPlanEntryView(BaseModel):
    day: str
    slot: str
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
