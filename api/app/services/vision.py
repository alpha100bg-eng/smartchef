"""Vision service — detect fridge inventory from a photo (F1, spec §7.1).

Prototype model: Claude Sonnet 5, structured JSON output, prompt caching on the
system prompt + schema. Evaluate Haiku 4.5 on the same photos and switch down if
quality holds (spec §7.1). Never Opus.
"""
from functools import lru_cache

from anthropic import Anthropic

from app.core.config import settings
from app.core.supabase_client import get_supabase_admin
from app.models.inventory import VisionResult

# Default Claude Sonnet 5 (best inventory recall — the product's core). Measured
# on 12 fridge photos (2026-08): Haiku 4.5 is ~4.5× cheaper but misses ~23% of
# items and calibrates confidence poorly, which degrades the inventory; the ~6¢/
# user/month saving doesn't justify it. Haiku stays a documented fallback via the
# VISION_MODEL env var.
VISION_MODEL = settings.vision_model
BUCKET = "fridge-photos"
SIGNED_URL_TTL_SECONDS = 120

# Stable prefix — cached (spec: prompt caching mandatory on system/schema).
SYSTEM_PROMPT = (
    "Tu es un détecteur d'inventaire alimentaire. À partir d'une photo de "
    "frigo, identifie chaque aliment visible et renvoie une liste structurée. "
    "Pour chaque item : nom en français, quantité et unité estimées, marque si "
    "lisible, date de péremption si lisible (sinon null). Renseigne un "
    "`confidence` entre 0 et 1 : élevé si tu es sûr, bas si l'item est flou, "
    "partiellement caché, ou si la quantité/date est incertaine. N'invente pas "
    "d'aliments non visibles. La quantité et les dates sont peu fiables — dans "
    "le doute, baisse le confidence plutôt que de deviner."
)


@lru_cache
def _client() -> Anthropic:
    return Anthropic(api_key=settings.anthropic_api_key, timeout=settings.ai_timeout_seconds, max_retries=2)


def _signed_url(storage_path: str) -> str:
    result = get_supabase_admin().storage.from_(BUCKET).create_signed_url(
        storage_path, SIGNED_URL_TTL_SECONDS
    )
    # storage3 has used both "signedURL" and "signedUrl" across versions.
    url = result.get("signedURL") or result.get("signedUrl")
    if not url:
        raise RuntimeError(f"could not sign storage path: {result}")
    return url


def detect_from_storage_path(storage_path: str) -> VisionResult:
    """Sign a short-lived URL for the photo, run Sonnet 5 vision, return the
    detected items. Does NOT write to the DB — the user reviews first."""
    url = _signed_url(storage_path)
    response = _client().messages.parse(
        model=VISION_MODEL,
        max_tokens=2000,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "url", "url": url}},
                    {
                        "type": "text",
                        "text": "Détecte les aliments visibles dans cette photo de frigo.",
                    },
                ],
            }
        ],
        output_format=VisionResult,
    )
    return response.parsed_output
