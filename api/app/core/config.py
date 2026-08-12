from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_key: str

    # Asymmetric JWT verification (ECC P-256 / ES256). The project signs tokens
    # with rotating private keys; we verify against the public JWKS endpoint,
    # conventionally <SUPABASE_URL>/auth/v1/.well-known/jwks.json.
    supabase_jwks_url: str

    # Anthropic (vision + LLM). Vision prototype uses Claude Sonnet 5 — see spec §7.1.
    anthropic_api_key: str = ""

    # Vision model. Default Sonnet 5 (best inventory recall). Haiku 4.5 is a
    # documented cheaper fallback (~4.5× cheaper) but misses ~23% of items —
    # set VISION_MODEL=claude-haiku-4-5 to opt in.
    vision_model: str = "claude-sonnet-5"

    # Hard ceiling on Anthropic calls. Meal-plan generation is the slowest
    # (~50s observed), so leave generous headroom above it.
    ai_timeout_seconds: float = 120.0

    # Daily per-user AI quotas (spec §9). Meal-plan generation is by far the
    # most expensive call, so it gets the tightest budget.
    quota_vision_per_day: int = 20
    quota_search_per_day: int = 50
    quota_meal_plan_per_day: int = 5
    quota_shopping_per_day: int = 20

    # Shared secret for internal cron jobs (e.g. photo cleanup).
    cron_secret: str = ""

    # Comma-separated origins allowed to call the API from a browser.
    # Dev default covers the Expo web dev server on either loopback spelling.
    cors_origins: str = "http://localhost:8081,http://127.0.0.1:8081"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
