from functools import lru_cache

from supabase import create_client, Client

from app.core.config import settings


@lru_cache
def get_supabase_admin() -> Client:
    """Service-role client: bypasses RLS. Only for operations the client cannot
    perform itself (e.g. RGPD account deletion), never for regular CRUD.

    Created lazily (not at import) so the app and tests can be imported without
    valid Supabase credentials — the client is only built on first real use."""
    return create_client(settings.supabase_url, settings.supabase_service_key)
