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

    # Quotas IA quotidiens, par utilisateur (spec §9).
    #
    # Ce sont des garde-fous anti-abus, pas des limites d'usage : un
    # utilisateur régulier consomme ~8 scans, 20 recherches et 4 plans par
    # MOIS. Les valeurs ci-dessous sont trois à quinze fois au-dessus de cet
    # usage tout en bornant ce qu'un seul compte peut coûter.
    #
    # Coûts mesurés le 2026-09-01 (appels réels, tokens facturés) :
    #   scan photo ~1,06 ¢ · recherche ~1,07 ¢ · recette ~1,21 ¢
    #   plan de repas ~13,37 ¢ · courses ~0,27 ¢
    # Le plan de repas coûte à lui seul autant que douze recherches, d'où le
    # quota le plus serré. Exposition maximale d'un compte : ~15,6 $/mois,
    # contre ~45 $ avec les quotas de développement précédents (−66 %).
    #
    # Limite connue : un quota quotidien borne mal un coût mensuel (2 plans par
    # jour = 60 par mois). Le vrai plafond mensuel viendra avec les paliers
    # d'abonnement.
    quota_vision_per_day: int = 5
    quota_search_per_day: int = 15  # partagé entre la liste et le détail
    quota_meal_plan_per_day: int = 2
    quota_shopping_per_day: int = 10

    # Shared secret for internal cron jobs (e.g. photo cleanup).
    cron_secret: str = ""

    # ── Abonnement Stripe ────────────────────────────────────────────
    # Vides en développement : les routes /billing répondent alors 503 plutôt
    # que de planter, et le reste de l'app fonctionne normalement.
    stripe_secret_key: str = ""
    stripe_price_premium: str = ""  # identifiant du prix récurrent (price_...)
    # Signature des webhooks. SANS ce secret, n'importe qui pourrait appeler
    # /billing/webhook et s'offrir un abonnement — la route refuse donc de
    # traiter quoi que ce soit s'il est absent.
    stripe_webhook_secret: str = ""
    # Où Stripe renvoie l'utilisateur après paiement.
    app_url: str = "https://alpha100bg-eng.github.io/smartchef/"

    # Comma-separated origins allowed to call the API from a browser.
    # Dev default covers the Expo web dev server on either loopback spelling.
    cors_origins: str = "http://localhost:8081,http://127.0.0.1:8081"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
