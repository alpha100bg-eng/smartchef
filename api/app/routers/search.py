from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_profile_id
from app.models.recipe import SearchRequest, SearchResult
from app.services import quota, search
from app.services.quota import QuotaExceeded

router = APIRouter(tags=["search"])


@router.post("/search", response_model=SearchResult)
def search_endpoint(
    body: SearchRequest,
    profile_id: str = Depends(get_profile_id),
):
    """Natural-language recipe search (F5). Uses the caller's inventory + profile
    (diet, allergies) server-side to keep results coherent and safe."""
    query = body.query.strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="query is required"
        )
    try:
        quota.consume(profile_id, "search")
    except QuotaExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Limite atteinte : {exc.limit} recherches par jour. Réessaie demain.",
        )

    try:
        return search.search_recipes(profile_id, query)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"search failed: {exc}",
        )
