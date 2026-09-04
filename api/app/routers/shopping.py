from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_profile_id
from app.models.shopping import FromPlanRequest, ShoppingListView
from app import quota_guard
from app.services import shopping

router = APIRouter(prefix="/shopping-list", tags=["shopping-list"])


@router.post("/from-plan", response_model=ShoppingListView)
def from_plan(body: FromPlanRequest, profile_id: str = Depends(get_profile_id)):
    """Build a deduplicated shopping list from a meal plan (F7), subtracting what
    the user already has (binary; excluded items returned in already_in_fridge)."""
    quota_guard.consume(profile_id, "shopping")

    try:
        return shopping.build_from_plan(profile_id, body.meal_plan_id)
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="meal plan not found")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"shopping-list build failed: {exc}",
        )
