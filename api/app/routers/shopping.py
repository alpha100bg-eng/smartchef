from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_profile_id
from app.models.shopping import FromPlanRequest, ShoppingListView
from app.services import quota, shopping
from app.services.quota import QuotaExceeded

router = APIRouter(prefix="/shopping-list", tags=["shopping-list"])


@router.post("/from-plan", response_model=ShoppingListView)
def from_plan(body: FromPlanRequest, profile_id: str = Depends(get_profile_id)):
    """Build a deduplicated shopping list from a meal plan (F7), subtracting what
    the user already has (binary; excluded items returned in already_in_fridge)."""
    try:
        quota.consume(profile_id, "shopping")
    except QuotaExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Limite atteinte : {exc.limit} listes par jour. Réessaie demain.",
        )

    try:
        return shopping.build_from_plan(profile_id, body.meal_plan_id)
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="meal plan not found")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"shopping-list build failed: {exc}",
        )
