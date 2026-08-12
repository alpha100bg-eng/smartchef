import threading
import time

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from jose.exceptions import JWTError

from app.core.config import settings

bearer_scheme = HTTPBearer()

ALGORITHMS = ["ES256"]
AUDIENCE = "authenticated"

# In-memory cache of the project's public signing keys, indexed by `kid`.
# Refreshed when stale or when a token presents an unknown kid (key rotation).
_JWKS_TTL_SECONDS = 3600
_jwks_cache: dict = {"keys_by_kid": {}, "fetched_at": 0.0}
_jwks_lock = threading.Lock()


def _fetch_jwks() -> dict:
    """Fetch the raw JWKS document from Supabase. Patched in tests."""
    response = httpx.get(settings.supabase_jwks_url, timeout=10.0)
    response.raise_for_status()
    return response.json()


def _refresh_cache() -> None:
    data = _fetch_jwks()
    _jwks_cache["keys_by_kid"] = {
        key["kid"]: key for key in data.get("keys", []) if "kid" in key
    }
    _jwks_cache["fetched_at"] = time.time()


def _get_signing_key(kid: str) -> dict | None:
    """Return the JWK matching `kid`, refreshing the cache if stale or on miss."""
    with _jwks_lock:
        is_stale = (time.time() - _jwks_cache["fetched_at"]) > _JWKS_TTL_SECONDS
        if not _jwks_cache["keys_by_kid"] or is_stale:
            _refresh_cache()

        key = _jwks_cache["keys_by_kid"].get(kid)
        if key is None:
            # Unknown kid — the key set may have rotated. Refresh once more.
            _refresh_cache()
            key = _jwks_cache["keys_by_kid"].get(kid)
        return key


def get_profile_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    """Validate the Supabase ES256 JWT against the JWKS and return the
    profile_id (auth.users.id, the token's `sub` claim)."""
    token = credentials.credentials

    try:
        header = jwt.get_unverified_header(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed token"
        )

    kid = header.get("kid")
    if not kid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing kid"
        )

    signing_key = _get_signing_key(kid)
    if signing_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown signing key"
        )

    try:
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=ALGORITHMS,
            audience=AUDIENCE,
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    profile_id = payload.get("sub")
    if not profile_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim",
        )
    return profile_id
