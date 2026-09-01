from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_profile_id
from app.models.meal_plan import (
    GenerateRequest,
    InstructionsRequest,
    InstructionsResponse,
    MealPlanView,
)
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


@router.post("/instructions", response_model=InstructionsResponse)
def instructions(body: InstructionsRequest, profile_id: str = Depends(get_profile_id)):
    """Rédiger la préparation d'une recette du plan, à la première ouverture.

    Le plan ne génère plus les préparations d'un bloc : elles pesaient ~74 %
    des tokens et tronquaient le JSON. Le texte est conservé en base, donc
    rouvrir la même recette ne relance aucun appel.

    Compté sur le quota `search` : c'est exactement le même geste et le même
    coût qu'ouvrir une recette depuis la recherche. Le quota `meal_plan`
    (2/jour) doit rester réservé à la génération de la semaine.
    """
    try:
        quota.consume(profile_id, "search")
    except QuotaExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Limite atteinte : {exc.limit} recettes par jour. Réessaie demain.",
        )

    try:
        return InstructionsResponse(
            instructions=meal_plan.recipe_instructions(profile_id, body.recipe_id)
        )
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"instructions generation failed: {exc}",
        )


@router.get("/{plan_id}", response_model=MealPlanView)
def get_plan(plan_id: str, profile_id: str = Depends(get_profile_id)):
    try:
        return meal_plan.get_meal_plan(profile_id, plan_id)
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
