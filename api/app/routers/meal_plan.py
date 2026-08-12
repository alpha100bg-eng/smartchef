from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_profile_id
from app.models.meal_plan import GenerateRequest, MealPlanView
from app.services import meal_plan, quota
from app.services.quota import QuotaExceeded

router = APIRouter(prefix="/meal-plan", tags=["meal-plan"])


@router.post("/generate", response_model=MealPlanView)
def generate(body: GenerateRequest, profile_id: str = Depends(get_profile_id)):
    """Generate + persist a weekly meal plan (F2) from the caller's inventory,
    profile, allergies and budget."""
    try:
        quota.consume(profile_id, "meal_plan")
    except QuotaExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Limite atteinte : {exc.limit} plans par jour. Réessaie demain.",
        )

    try:
        return meal_plan.generate_meal_plan(profile_id, body.week_start, body.budget)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"meal-plan generation failed: {exc}",
        )


@router.get("/{plan_id}", response_model=MealPlanView)
def get_plan(plan_id: str, profile_id: str = Depends(get_profile_id)):
    try:
        return meal_plan.get_meal_plan(profile_id, plan_id)
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
