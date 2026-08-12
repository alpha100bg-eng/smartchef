from fastapi import APIRouter, Depends, HTTPException, status

from app.core.supabase_client import get_supabase_admin
from app.deps import get_profile_id
from app.models.profile import ProfileOut

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("/me", response_model=ProfileOut)
def read_own_profile(profile_id: str = Depends(get_profile_id)):
    """Auth smoke test only. The app reads its own profile directly via
    Supabase + RLS; this endpoint exists to verify the FastAPI JWT pipeline."""
    result = (
        get_supabase_admin()
        .table("profiles")
        .select("*")
        .eq("id", profile_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return result.data


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_own_account(profile_id: str = Depends(get_profile_id)):
    """RGPD: permanently deletes the caller's auth user + profile (cascades
    to allergies and all profile-scoped data via FK ON DELETE CASCADE)."""
    get_supabase_admin().auth.admin.delete_user(profile_id)
