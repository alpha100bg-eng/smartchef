import os
from pathlib import Path
from unittest.mock import patch

import pytest

# Provide dummy settings ONLY when there is no real api/.env (e.g. CI). When
# api/.env exists, let pydantic load the real values from it — otherwise these
# env vars would take precedence over the file and break the live test.
_env_file = Path(__file__).resolve().parent.parent / ".env"
if not _env_file.exists():
    os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
    os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
    os.environ.setdefault(
        "SUPABASE_JWKS_URL",
        "http://localhost:54321/auth/v1/.well-known/jwks.json",
    )


@pytest.fixture(autouse=True)
def _quota_allows_by_default(request):
    """Every AI route consumes quota, which hits Postgres. Tests that aren't
    about quota shouldn't need a database — let the call through. Quota tests
    patch the same symbol themselves, which takes precedence."""
    nodeid = request.node.nodeid
    # test_quota.py drives the real thing; live tests exercise the real project.
    if "test_quota" in nodeid or "live" in nodeid:
        yield
        return
    with patch("app.services.quota.consume", return_value=None):
        yield
