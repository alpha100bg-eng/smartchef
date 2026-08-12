from pydantic import BaseModel, Field


class RecipeIngredient(BaseModel):
    name: str
    quantity: float | None = None
    unit: str | None = None


class Recipe(BaseModel):
    title: str
    prep_time_min: int | None = None
    servings: int | None = None
    ingredients: list[RecipeIngredient]
    steps: list[str]
    uses_inventory: list[str] = Field(
        default_factory=list,
        description="Names of ingredients that come from the user's current fridge",
    )


class SearchResult(BaseModel):
    recipes: list[Recipe]


class SearchRequest(BaseModel):
    # Bounded: an unbounded prompt is both a cost and an injection surface.
    query: str = Field(min_length=1, max_length=500)
