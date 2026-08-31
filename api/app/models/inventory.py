from pydantic import BaseModel, Field


class DetectedItem(BaseModel):
    """One food item detected in a fridge photo (spec §7.1)."""

    name: str
    quantity: float | None = None
    unit: str | None = None
    brand: str | None = None
    expiry_date: str | None = None  # ISO date string or null — often unreadable
    shelf_life_days: int | None = Field(
        default=None,
        description=(
            "Durée de conservation typique au frigo, en jours, à partir "
            "d'aujourd'hui. Sert à estimer une péremption quand aucune date "
            "n'est lisible sur l'emballage."
        ),
    )
    confidence: float = Field(description="0.0–1.0; low values flag doubtful items")


class VisionResult(BaseModel):
    items: list[DetectedItem]


class FromPhotoRequest(BaseModel):
    storage_path: str  # "{profile_id}/{uuid}.jpg" in the fridge-photos bucket
