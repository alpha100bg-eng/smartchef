from pydantic import BaseModel


class ProfileOut(BaseModel):
    id: str
    display_name: str | None = None
    budget_weekly: float | None = None
    time_per_meal_min: int | None = None
    diet_type: str | None = None
    goals: list[str] = []
