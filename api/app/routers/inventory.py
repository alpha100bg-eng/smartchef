from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_profile_id
from app.models.inventory import FromPhotoRequest, VisionResult
from app.services import quota, vision
from app.services.quota import QuotaExceeded

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.post("/from-photo", response_model=VisionResult)
def inventory_from_photo(
    body: FromPhotoRequest,
    profile_id: str = Depends(get_profile_id),
):
    """Detect food items from a fridge photo (F1). Returns items for the user to
    review and correct — nothing is written to the DB here.

    Security: the service-role client used to sign the photo URL bypasses Storage
    RLS, so we must verify the path belongs to the caller before signing it."""
    if not body.storage_path.startswith(f"{profile_id}/"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="storage_path does not belong to the caller",
        )
    try:
        quota.consume(profile_id, "vision")
    except QuotaExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Limite atteinte : {exc.limit} scans par jour. Réessaie demain.",
        )

    try:
        return vision.detect_from_storage_path(body.storage_path)
    except Exception as exc:  # signing failure, vision API error, parse error
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"vision detection failed: {exc}",
        )
