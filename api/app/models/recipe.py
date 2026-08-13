from pydantic import BaseModel, Field


class RecipeIngredient(BaseModel):
    name: str
    quantity: float | None = None
    unit: str | None = None


class RecipeSummary(BaseModel):
    """What the search results list shows. Cheap and fast to generate — full
    ingredients and steps are fetched only when the user opens a recipe."""

    title: str
    teaser: str = Field(description="Une phrase qui donne envie, sans la recette")
    prep_time_min: int | None = None
    servings: int | None = None
    uses_inventory: list[str] = Field(
        default_factory=list,
        description="Names of ingredients that come from the user's current fridge",
    )


class Recipe(RecipeSummary):
    """A fully detailed recipe, generated on demand."""

    ingredients: list[RecipeIngredient] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)


class SearchResult(BaseModel):
    recipes: list[RecipeSummary]


class SearchRequest(BaseModel):
    # Bounded: an unbounded prompt is both a cost and an injection surface.
    query: str = Field(min_length=1, max_length=500)


class RecipeDetailRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    # Echoed back from the summary so the detail matches what was listed.
    teaser: str = Field(default="", max_length=500)
