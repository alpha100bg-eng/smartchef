"""Shopping-list service — build a list from a meal plan (F7, spec §7 / §6).

Pipeline (see design):
  A. aggregate all recipe ingredients across the plan's scheduled entries
  B. reconcile vs inventory: layer 1 (deterministic exact match) then layer 2
     (Haiku, conservative semantic match) — layer 2 also does aisle + price
  C. binary subtraction (present → excluded, shown separately, re-addable)
  D. prices are approximations only
  E. persist shopping_list + items (buy list), ownership checked on the plan
"""
from functools import lru_cache

from anthropic import Anthropic

from app.core.config import settings
from app.core.supabase_client import get_supabase_admin
from app.models.shopping import ReconcileResult, ShoppingItem, ShoppingListView
from app.services.text_match import layer1_covered, normalize

RECONCILE_MODEL = "claude-haiku-4-5"  # classification/aisle/price — cheap tier

SYSTEM_PROMPT = (
    "Tu aides à préparer une liste de courses. On te donne des ingrédients "
    "CANDIDATS à acheter et l'INVENTAIRE actuel du frigo. Pour chaque candidat : "
    "(1) `already_in_inventory` — mets `true` UNIQUEMENT si l'ingrédient est "
    "clairement déjà présent dans l'inventaire (même produit) ; en cas de doute, "
    "mets `false` (mieux vaut racheter que manquer). « lait » ne couvre PAS "
    "« lait d'amande » ; « oignon » ne couvre PAS « oignon nouveau ». "
    "(2) `aisle` — le rayon de supermarché (ex. « Fruits et légumes », "
    "« Produits laitiers », « Viande et poisson », « Épicerie », « Surgelés », "
    "« Boulangerie »). (3) `estimated_price` — prix approximatif en euros. "
    "Renvoie une entrée par candidat, même nom."
)


@lru_cache
def _client() -> Anthropic:
    return Anthropic(api_key=settings.anthropic_api_key, timeout=settings.ai_timeout_seconds, max_retries=2)


def _aggregate_ingredients(admin, meal_plan_id: str) -> list[dict]:
    """Sum ingredients across every scheduled entry (a recipe used N times counts
    N times). Group by (normalized name, unit); keep first-seen display name."""
    entries = (
        admin.table("meal_plan_entries")
        .select("recipe_id")
        .eq("meal_plan_id", meal_plan_id)
        .execute()
    )
    ingredients_by_recipe: dict[str, list[dict]] = {}
    agg: dict[tuple, dict] = {}
    for e in entries.data or []:
        rid = e["recipe_id"]
        if rid not in ingredients_by_recipe:
            res = (
                admin.table("recipe_ingredients")
                .select("name, quantity, unit")
                .eq("recipe_id", rid)
                .execute()
            )
            ingredients_by_recipe[rid] = res.data or []
        for ing in ingredients_by_recipe[rid]:
            key = (normalize(ing["name"]), (ing.get("unit") or "").lower())
            if key not in agg:
                agg[key] = {
                    "name": ing["name"],
                    "quantity": ing.get("quantity"),
                    "unit": ing.get("unit"),
                }
            else:
                cur = agg[key]
                if cur["quantity"] is not None and ing.get("quantity") is not None:
                    cur["quantity"] += ing["quantity"]
    return list(agg.values())


def _reconcile_with_haiku(candidates: list[dict], inventory_names: list[str]) -> ReconcileResult:
    import json

    payload = {
        "candidats": [c["name"] for c in candidates],
        "inventaire": inventory_names,
    }
    resp = _client().messages.parse(
        model=RECONCILE_MODEL,
        max_tokens=2000,
        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
        output_format=ReconcileResult,
    )
    return resp.parsed_output


def build_from_plan(profile_id: str, meal_plan_id: str) -> ShoppingListView:
    admin = get_supabase_admin()

    plan = admin.table("meal_plans").select("id, profile_id").eq("id", meal_plan_id).single().execute()
    if not plan.data or plan.data["profile_id"] != profile_id:
        raise LookupError("meal plan not found")

    aggregated = _aggregate_ingredients(admin, meal_plan_id)
    inventory = (
        admin.table("inventory_items").select("name").eq("profile_id", profile_id).execute()
    )
    inventory_names = [i["name"] for i in (inventory.data or [])]

    # Layer 1 — sure matches only
    already_in_fridge: list[str] = []
    candidates: list[dict] = []
    for ing in aggregated:
        if layer1_covered(ing["name"], inventory_names):
            already_in_fridge.append(ing["name"])
        else:
            candidates.append(ing)

    # Layer 2 — Haiku: conservative reconciliation + aisle + price
    reco_by_name: dict[str, object] = {}
    if candidates:
        result = _reconcile_with_haiku(candidates, inventory_names)
        reco_by_name = {normalize(r.name): r for r in result.items}

    buy: list[ShoppingItem] = []
    for ing in candidates:
        r = reco_by_name.get(normalize(ing["name"]))
        if r is not None and r.already_in_inventory:
            already_in_fridge.append(ing["name"])
            continue
        buy.append(ShoppingItem(
            name=ing["name"],
            quantity=ing.get("quantity"),
            unit=ing.get("unit"),
            aisle=(r.aisle if r else None),
            estimated_price=(r.estimated_price if r else None),
        ))

    # Persist buy list
    sl = admin.table("shopping_lists").insert({
        "profile_id": profile_id,
        "meal_plan_id": meal_plan_id,
        "status": "active",
    }).execute()
    list_id = sl.data[0]["id"]
    if buy:
        inserted = admin.table("shopping_list_items").insert([
            {
                "shopping_list_id": list_id,
                "name": b.name,
                "quantity": b.quantity,
                "unit": b.unit,
                "aisle": b.aisle,
                "estimated_price": b.estimated_price,
                "checked": False,
            }
            for b in buy
        ]).execute()
        # Hand the row ids back so the app can persist the checked state.
        for item, row in zip(buy, inserted.data or []):
            item.id = row.get("id")

    total = sum(b.estimated_price for b in buy if b.estimated_price is not None) or None
    return ShoppingListView(
        id=list_id,
        meal_plan_id=meal_plan_id,
        status="active",
        items=buy,
        estimated_total=total,
        already_in_fridge=already_in_fridge,
    )
