from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_profile_id
from app.lang import get_lang
from app.models.recipe import Recipe, RecipeDetailRequest, SearchRequest, SearchResult
from app import errors, quota_guard
from app.services import search

router = APIRouter(tags=["search"])


@router.post("/search", response_model=SearchResult)
def search_endpoint(
    body: SearchRequest,
    profile_id: str = Depends(get_profile_id),
    lang: str = Depends(get_lang),
):
    """Natural-language recipe search (F5). Uses the caller's inventory + profile
    (diet, allergies) server-side to keep results coherent and safe."""
    query = body.query.strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="query is required"
        )
    quota_guard.consume(profile_id, "search", lang)

    try:
        return search.search_recipes(profile_id, query, lang)
    except Exception as exc:
        raise errors.ia_indisponible("recherche de recettes", exc, lang)


@router.post("/search/detail", response_model=Recipe)
def recipe_detail_endpoint(
    body: RecipeDetailRequest,
    profile_id: str = Depends(get_profile_id),
    lang: str = Depends(get_lang),
):
    """Full recipe for one search result, generated when the user opens it.
    Keeps the listing fast and only bills recipes that are actually read."""
    quota_guard.consume(profile_id, "search", lang)

    try:
        return search.recipe_detail(
            profile_id, body.title.strip(), body.teaser.strip(), lang
        )
    except Exception as exc:
        raise errors.ia_indisponible("detail de recette", exc, lang)
