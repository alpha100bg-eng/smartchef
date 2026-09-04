from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel

from app.deps import get_profile_id
from app.services import billing, plan as plan_svc, quota
from app.services.billing import BillingUnavailable

router = APIRouter(prefix="/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    # Pré-remplit l'e-mail sur la page Stripe. Purement pratique : le profil
    # vient du jeton, jamais du corps de la requête.
    email: str | None = None


class CheckoutResponse(BaseModel):
    url: str


class StatusResponse(BaseModel):
    plan: str
    price_eur: str
    limits: dict[str, int]
    used: dict[str, int]
    billing_available: bool


@router.get("/status", response_model=StatusResponse)
def billing_status(profile_id: str = Depends(get_profile_id)):
    """Palier, quotas et consommation du mois — de quoi afficher « il te reste
    2 scans » sans que le front ait à connaître les limites."""
    current = plan_svc.current_plan(profile_id)
    limits = plan_svc.limits_for(current)
    return StatusResponse(
        plan=current,
        price_eur=plan_svc.PREMIUM_PRICE_EUR,
        limits={
            "vision": limits.vision,
            "search": limits.search,
            "meal_plan": limits.meal_plan,
            "shopping": limits.shopping,
        },
        used=quota.usage_this_month(profile_id),
        billing_available=billing.configured(),
    )


@router.post("/checkout", response_model=CheckoutResponse)
def checkout(body: CheckoutRequest, profile_id: str = Depends(get_profile_id)):
    """Ouvre une session Stripe Checkout et renvoie l'URL de paiement."""
    if plan_svc.current_plan(profile_id) == plan_svc.PREMIUM:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tu es déjà abonné.",
        )
    try:
        return CheckoutResponse(url=billing.create_checkout(profile_id, body.email))
    except BillingUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Le paiement n'est pas encore activé.",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"checkout failed: {exc}",
        )


@router.post("/webhook", include_in_schema=False)
async def webhook(request: Request, stripe_signature: str = Header(default="")):
    """Appelé par Stripe. C'est le SEUL endroit où le palier change.

    Volontairement sans authentification utilisateur — Stripe n'en a pas — mais
    la signature est vérifiée : sans elle, la route offrirait Premium à qui la
    trouverait.
    """
    payload = await request.body()
    try:
        kind = billing.handle_event(payload, stripe_signature)
    except BillingUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="webhook not configured",
        )
    except Exception:
        # Signature invalide ou charge utile illisible. Message volontairement
        # muet : ne rien apprendre à qui sonde la route.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid webhook"
        )
    # Stripe réessaie tant qu'il ne reçoit pas un 2xx.
    return {"received": kind}
