"""Abonnement Stripe.

Le point critique est le webhook : c'est une route publique qui accorde un
abonnement. Sans vérification de signature, quiconque la trouve devient
Premium gratuitement.
"""
import datetime
from unittest.mock import MagicMock, patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jose import jwk, jwt

import app.deps as deps
from app.main import app
from app.services.billing import BillingUnavailable
from app.services.plan import FREE, PREMIUM

client = TestClient(app)
TEST_KID = "test-key-1"
PID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture(scope="module")
def ec_keys():
    pk = ec.generate_private_key(ec.SECP256R1())
    priv = pk.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    pub = pk.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    d = jwk.construct(pub, algorithm="ES256").to_dict()
    d["kid"] = TEST_KID
    d["alg"] = "ES256"
    return priv, d


@pytest.fixture(autouse=True)
def patched_jwks(ec_keys):
    _, pub = ec_keys
    deps._jwks_cache["keys_by_kid"] = {}
    deps._jwks_cache["fetched_at"] = 0.0
    with patch.object(deps, "_fetch_jwks", return_value={"keys": [pub]}):
        yield


@pytest.fixture(autouse=True)
def webhook_secret_configured():
    """Le secret est vide en test comme en développement, et la route refuse
    alors de traiter quoi que ce soit — ce qui est le bon comportement. On en
    pose un ici pour pouvoir tester la suite ; le cas « non configuré » a son
    propre test, qui le remet à vide."""
    from app.core.config import settings

    with patch.object(settings, "stripe_webhook_secret", "whsec_test"):
        yield


def auth(ec_keys):
    priv, _ = ec_keys
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=60)
    tok = jwt.encode({"sub": PID, "aud": "authenticated", "exp": exp},
                     priv, algorithm="ES256", headers={"kid": TEST_KID})
    return {"Authorization": f"Bearer {tok}"}


# ── Le webhook, seule voie vers Premium ─────────────────────────────
def test_webhook_rejects_a_forged_call():
    """Une requête sans signature valable ne doit rien accorder."""
    with patch("app.services.billing.stripe.Webhook.construct_event",
               side_effect=ValueError("bad signature")), \
         patch("app.services.billing._set_plan") as set_plan:
        resp = client.post("/billing/webhook",
                           content=b'{"type":"checkout.session.completed"}',
                           headers={"stripe-signature": "n_importe_quoi"})

    assert resp.status_code == 400
    set_plan.assert_not_called()  # l'essentiel : aucun abonnement offert


def test_webhook_refuses_to_run_without_a_configured_secret():
    from app.core.config import settings

    with patch.object(settings, "stripe_webhook_secret", ""), \
         patch("app.services.billing._set_plan") as set_plan:
        resp = client.post("/billing/webhook", content=b"{}",
                           headers={"stripe-signature": "x"})

    assert resp.status_code == 503
    set_plan.assert_not_called()


def test_a_paid_session_grants_premium():
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {
            "client_reference_id": PID,
            "customer": "cus_1",
            "subscription": "sub_1",
        }},
    }
    with patch("app.services.billing.stripe.Webhook.construct_event", return_value=event), \
         patch("app.services.billing._set_plan") as set_plan:
        resp = client.post("/billing/webhook", content=b"{}",
                           headers={"stripe-signature": "ok"})

    assert resp.status_code == 200
    set_plan.assert_called_once()
    assert set_plan.call_args[0] == (PID, PREMIUM)


def test_a_cancelled_subscription_returns_to_free():
    event = {
        "type": "customer.subscription.deleted",
        "data": {"object": {
            "id": "sub_1", "status": "canceled",
            "metadata": {"profile_id": PID},
        }},
    }
    with patch("app.services.billing.stripe.Webhook.construct_event", return_value=event), \
         patch("app.services.billing._set_plan") as set_plan:
        client.post("/billing/webhook", content=b"{}", headers={"stripe-signature": "ok"})

    assert set_plan.call_args[0] == (PID, FREE)


def test_a_failed_payment_does_not_cut_access_immediately():
    """`past_due` = la carte a échoué mais peut repasser. Couper au premier
    échec est brutal et fait perdre des abonnés qui allaient payer."""
    event = {
        "type": "customer.subscription.updated",
        "data": {"object": {
            "id": "sub_1", "status": "past_due",
            "metadata": {"profile_id": PID},
            "current_period_end": 1790000000,
        }},
    }
    with patch("app.services.billing.stripe.Webhook.construct_event", return_value=event), \
         patch("app.services.billing._set_plan") as set_plan:
        client.post("/billing/webhook", content=b"{}", headers={"stripe-signature": "ok"})

    assert set_plan.call_args[0] == (PID, PREMIUM)


def test_an_event_without_a_profile_changes_nothing():
    event = {"type": "checkout.session.completed", "data": {"object": {}}}
    with patch("app.services.billing.stripe.Webhook.construct_event", return_value=event), \
         patch("app.services.billing._set_plan") as set_plan:
        resp = client.post("/billing/webhook", content=b"{}",
                           headers={"stripe-signature": "ok"})

    assert resp.status_code == 200
    set_plan.assert_not_called()


# ── Checkout ────────────────────────────────────────────────────────
def test_checkout_requires_auth():
    assert client.post("/billing/checkout", json={}).status_code == 403


def test_checkout_returns_the_stripe_url(ec_keys):
    with patch("app.services.plan.current_plan", return_value=FREE), \
         patch("app.services.billing.create_checkout",
               return_value="https://checkout.stripe.com/c/pay/abc"):
        resp = client.post("/billing/checkout", headers=auth(ec_keys),
                           json={"email": "a@b.c"})

    assert resp.status_code == 200
    assert resp.json()["url"].startswith("https://checkout.stripe.com/")


def test_an_existing_subscriber_is_not_charged_twice(ec_keys):
    with patch("app.services.plan.current_plan", return_value=PREMIUM), \
         patch("app.services.billing.create_checkout") as create:
        resp = client.post("/billing/checkout", headers=auth(ec_keys), json={})

    assert resp.status_code == 409
    create.assert_not_called()


def test_checkout_says_so_when_stripe_is_not_configured(ec_keys):
    with patch("app.services.plan.current_plan", return_value=FREE), \
         patch("app.services.billing.create_checkout", side_effect=BillingUnavailable()):
        resp = client.post("/billing/checkout", headers=auth(ec_keys), json={})

    assert resp.status_code == 503


# ── Statut ──────────────────────────────────────────────────────────
def test_status_exposes_the_plan_and_what_is_left(ec_keys):
    with patch("app.services.plan.current_plan", return_value=FREE), \
         patch("app.services.quota.usage_this_month", return_value={"vision": 2}):
        body = client.get("/billing/status", headers=auth(ec_keys)).json()

    assert body["plan"] == FREE
    assert body["limits"]["meal_plan"] == 0      # fermé au gratuit
    assert body["limits"]["vision"] > 0
    assert body["used"]["vision"] == 2
    assert body["price_eur"] == "4,99"


def test_expired_premium_reads_as_free():
    """Le webhook peut tarder ou manquer : la date fait foi, pas la colonne."""
    from app.services import plan as plan_mod

    admin = MagicMock()
    admin.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
        data={"plan": PREMIUM, "premium_until": "2020-01-01T00:00:00+00:00"}
    )
    with patch.object(plan_mod, "get_supabase_admin", return_value=admin):
        assert plan_mod.current_plan(PID) == FREE
