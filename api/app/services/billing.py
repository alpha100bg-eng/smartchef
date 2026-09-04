"""Abonnement Premium via Stripe Checkout.

Deux mouvements seulement :
  1. l'app demande une session de paiement et redirige vers Stripe ;
  2. Stripe rappelle `/billing/webhook` et c'est LÀ, et seulement là, que le
     palier change en base.

Le front ne décide jamais du palier : il pourrait mentir. La colonne `plan`
n'est d'ailleurs pas modifiable par l'utilisateur (trigger `forbid_self_upgrade`
de la migration 0008), même avec sa propre clé.
"""
from datetime import datetime, timezone

import stripe

from app.core.config import settings
from app.core.supabase_client import get_supabase_admin
from app.services.plan import FREE, PREMIUM


class BillingUnavailable(Exception):
    """Stripe n'est pas configuré sur cet environnement."""


def configured() -> bool:
    return bool(settings.stripe_secret_key and settings.stripe_price_premium)


def _client() -> stripe.StripeClient:
    if not configured():
        raise BillingUnavailable("stripe is not configured")
    return stripe.StripeClient(settings.stripe_secret_key)


def create_checkout(profile_id: str, email: str | None) -> str:
    """Ouvre une session de paiement et renvoie l'URL Stripe.

    `client_reference_id` porte le profil : c'est ce qui permet au webhook de
    savoir QUI vient de payer. Sans lui, un paiement arriverait sans propriétaire.
    """
    session = _client().checkout.sessions.create(
        params={
            "mode": "subscription",
            "line_items": [{"price": settings.stripe_price_premium, "quantity": 1}],
            "client_reference_id": profile_id,
            "customer_email": email or None,
            "success_url": f"{settings.app_url}?premium=ok",
            "cancel_url": f"{settings.app_url}?premium=annule",
            # Rattache le profil à l'abonnement lui-même : les événements de
            # renouvellement et de résiliation ne portent pas le
            # client_reference_id de la session initiale.
            "subscription_data": {"metadata": {"profile_id": profile_id}},
        }
    )
    return session.url


def _set_plan(
    profile_id: str,
    plan: str,
    *,
    until: str | None = None,
    customer: str | None = None,
    subscription: str | None = None,
) -> None:
    patch: dict = {"plan": plan, "premium_until": until}
    if customer:
        patch["stripe_customer_id"] = customer
    if subscription:
        patch["stripe_subscription_id"] = subscription
    get_supabase_admin().table("profiles").update(patch).eq("id", profile_id).execute()


def _iso(ts: int | None) -> str | None:
    if not ts:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def handle_event(payload: bytes, signature: str) -> str:
    """Vérifie la signature et applique l'événement. Renvoie le type traité.

    La vérification de signature n'est pas optionnelle : la route est publique,
    et sans elle n'importe qui pourrait s'offrir Premium par une simple requête.
    """
    if not settings.stripe_webhook_secret:
        raise BillingUnavailable("webhook secret is not configured")

    event = stripe.Webhook.construct_event(
        payload, signature, settings.stripe_webhook_secret
    )
    kind = event["type"]
    obj = event["data"]["object"]

    if kind == "checkout.session.completed":
        profile_id = obj.get("client_reference_id")
        if profile_id:
            _set_plan(
                profile_id,
                PREMIUM,
                customer=obj.get("customer"),
                subscription=obj.get("subscription"),
            )

    elif kind in ("customer.subscription.updated", "customer.subscription.deleted"):
        profile_id = (obj.get("metadata") or {}).get("profile_id")
        if profile_id:
            statut = obj.get("status")
            # `canceled` en fin de période, `unpaid`/`incomplete_expired` en cas
            # d'échec de paiement. Un `past_due` reste Premium : la carte peut
            # repasser, et couper l'accès au premier échec est brutal.
            actif = statut in ("active", "trialing", "past_due")
            _set_plan(
                profile_id,
                PREMIUM if actif else FREE,
                # Une résiliation laisse l'accès jusqu'au terme déjà payé.
                until=_iso(obj.get("current_period_end")) if actif else None,
                subscription=obj.get("id"),
            )

    return kind
