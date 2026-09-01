from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.deps import get_profile_id
from app.models.inventory import FromPhotoRequest, VisionResult
from app.services import quota, shelf_life, vision
from app.services.quota import QuotaExceeded

router = APIRouter(prefix="/inventory", tags=["inventory"])

# Une liste de courses réaliste tient largement dedans ; la borne évite qu'un
# appel unique fasse exploser le coût ou dépasse max_tokens.
MAX_SHELF_LIFE_NAMES = 60


class ShelfLifeRequest(BaseModel):
    names: list[str] = Field(min_length=1, max_length=MAX_SHELF_LIFE_NAMES)


class ShelfLifeResponse(BaseModel):
    # nom -> date ISO, ou null si l'aliment ne se périme pas en pratique.
    expiry_dates: dict[str, str | None]


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


@router.post("/shelf-life", response_model=ShelfLifeResponse)
def estimate_shelf_life(
    body: ShelfLifeRequest,
    profile_id: str = Depends(get_profile_id),
):
    """Estimer une péremption pour des aliments désignés par leur nom (F1).

    Utilisé quand la liste de courses verse les articles achetés dans le frigo :
    sans image, la vision ne peut rien estimer, et ces articles échapperaient
    aux alertes de péremption.

    Compté sur le quota `shopping` : cet appel prolonge le parcours courses, et
    ouvrir un quota dédié pour un appel Haiku ne se justifie pas.
    """
    try:
        quota.consume(profile_id, "shopping")
    except QuotaExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Limite atteinte : {exc.limit} par jour. Réessaie demain.",
            # Le front ajoute quand même les articles, sans date estimée :
            # perdre les courses serait pire que perdre l'estimation.
        )

    try:
        return ShelfLifeResponse(expiry_dates=shelf_life.estimate(body.names))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"shelf-life estimation failed: {exc}",
        )
