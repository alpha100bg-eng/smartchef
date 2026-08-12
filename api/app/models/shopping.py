from pydantic import BaseModel


class ShoppingItem(BaseModel):
    # Row id, needed by the app to persist the checked state.
    id: str | None = None
    name: str
    quantity: float | None = None
    unit: str | None = None
    aisle: str | None = None
    estimated_price: float | None = None  # approximation only — display with "~"
    checked: bool = False


class ShoppingListView(BaseModel):
    id: str
    meal_plan_id: str | None = None
    status: str
    items: list[ShoppingItem]
    estimated_total: float | None = None  # sum of estimates — approximation only
    already_in_fridge: list[str] = []  # excluded (binary subtraction), user can re-add


class FromPlanRequest(BaseModel):
    meal_plan_id: str


# ── Layer-2 (Haiku) structured output ───────────────────────────────
class ReconciledItem(BaseModel):
    name: str
    already_in_inventory: bool  # conservative: true only if clearly present
    aisle: str
    estimated_price: float | None = None


class ReconcileResult(BaseModel):
    items: list[ReconciledItem]
