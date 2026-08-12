import datetime
from unittest.mock import MagicMock, patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jose import jwk, jwt

import app.deps as deps
from app.main import app
from app.models.shopping import ReconciledItem, ReconcileResult, ShoppingListView

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


def token(ec_keys) -> str:
    priv, _ = ec_keys
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=60)
    return jwt.encode({"sub": PID, "aud": "authenticated", "exp": exp},
                      priv, algorithm="ES256", headers={"kid": TEST_KID})


# ── endpoint wiring ─────────────────────────────────────────────────
def test_from_plan_returns_view(ec_keys):
    view = ShoppingListView(id="l1", meal_plan_id="p1", status="active", items=[],
                            estimated_total=None, already_in_fridge=[])
    with patch("app.services.shopping.build_from_plan", return_value=view):
        resp = client.post("/shopping-list/from-plan",
                           headers={"Authorization": f"Bearer {token(ec_keys)}"},
                           json={"meal_plan_id": "p1"})
    assert resp.status_code == 200, resp.text


def test_from_plan_foreign_plan_404(ec_keys):
    with patch("app.services.shopping.build_from_plan", side_effect=LookupError()):
        resp = client.post("/shopping-list/from-plan",
                           headers={"Authorization": f"Bearer {token(ec_keys)}"},
                           json={"meal_plan_id": "other"})
    assert resp.status_code == 404


def test_from_plan_requires_auth():
    resp = client.post("/shopping-list/from-plan", json={"meal_plan_id": "p1"})
    assert resp.status_code == 403


# ── pipeline logic (layer1 + layer2 conservative + binary) ──────────
def _admin_mock():
    admin = MagicMock()

    def table(name):
        t = MagicMock()
        if name == "meal_plans":
            t.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": "plan-1", "profile_id": PID
            }
        elif name == "inventory_items":
            t.select.return_value.eq.return_value.execute.return_value.data = [
                {"name": "tomates"}, {"name": "lait"}
            ]
        elif name == "shopping_lists":
            t.insert.return_value.execute.return_value.data = [{"id": "list-1"}]
        return t

    admin.table.side_effect = table
    return admin


def test_pipeline_layer1_layer2_binary():
    from app.services import shopping

    aggregated = [
        {"name": "Tomates", "quantity": 4, "unit": "piece"},       # layer1 → in fridge
        {"name": "lait d'amande", "quantity": 1, "unit": "L"},     # NOT covered by "lait"
        {"name": "poulet", "quantity": 500, "unit": "g"},          # to buy
    ]
    reco = ReconcileResult(items=[
        ReconciledItem(name="lait d'amande", already_in_inventory=False,
                       aisle="Produits laitiers", estimated_price=2.5),
        ReconciledItem(name="poulet", already_in_inventory=False,
                       aisle="Viande et poisson", estimated_price=6.0),
    ])

    with patch.object(shopping, "get_supabase_admin", return_value=_admin_mock()), \
         patch.object(shopping, "_aggregate_ingredients", return_value=aggregated), \
         patch.object(shopping, "_reconcile_with_haiku", return_value=reco):
        view = shopping.build_from_plan(PID, "plan-1")

    buy_names = {i.name for i in view.items}
    assert buy_names == {"lait d'amande", "poulet"}  # "lait d'amande" NOT dropped
    assert "Tomates" in view.already_in_fridge       # layer1 exact match excluded
    assert view.estimated_total == 8.5
    aisles = {i.name: i.aisle for i in view.items}
    assert aisles["poulet"] == "Viande et poisson"
