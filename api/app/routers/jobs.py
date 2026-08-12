from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.core.config import settings
from app.services import expiry, photo_cleanup

router = APIRouter(prefix="/jobs", tags=["jobs"])


def verify_cron_secret(authorization: str = Header(default="")) -> None:
    """Cron endpoints are protected by a shared bearer secret, not a user JWT."""
    expected = f"Bearer {settings.cron_secret}"
    if not settings.cron_secret or authorization != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid cron secret"
        )


@router.post("/photo-cleanup", dependencies=[Depends(verify_cron_secret)])
def photo_cleanup_job():
    """RGPD safety net — delete orphaned fridge photos older than 24h."""
    removed = photo_cleanup.sweep_orphans()
    return {"removed": removed}


@router.post("/expiry-check", dependencies=[Depends(verify_cron_secret)])
def expiry_check_job():
    """F4 — notify users about food expiring within the next few days.
    Intended to run once a day from an external scheduler."""
    return expiry.run_expiry_check()
