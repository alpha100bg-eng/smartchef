import { apiFetch } from "./api";
import { supabase } from "./supabase";
import { notifyInventoryChanged } from "./urgent-count";

export type ShoppingItem = {
  id: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  aisle: string | null;
  estimated_price: number | null;
  checked: boolean;
};

export type ShoppingListView = {
  id: string;
  meal_plan_id: string | null;
  status: string;
  items: ShoppingItem[];
  estimated_total: number | null;
  already_in_fridge: string[];
};

/** Most recent meal plan id for the user, or null. */
export async function latestMealPlanId(): Promise<string | null> {
  const { data } = await supabase
    .from("meal_plans")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1);
  return data && data.length ? (data[0].id as string) : null;
}

export async function buildFromPlan(mealPlanId: string): Promise<ShoppingListView> {
  return apiFetch("/shopping-list/from-plan", {
    method: "POST",
    body: JSON.stringify({ meal_plan_id: mealPlanId }),
  });
}

/** Persist a ticked item so it survives leaving the screen (RLS-protected). */
export async function setItemChecked(id: string, checked: boolean): Promise<void> {
  const { error } = await supabase
    .from("shopping_list_items")
    .update({ checked })
    .eq("id", id);
  if (error) throw error;
}

/**
 * "J'ai fait mes courses" — verse les articles cochés dans l'inventaire.
 *
 * Symétrique de « J'ai cuisiné ça » : sans ce chemin, le frigo ne se remplit
 * que par photo. On coche ses articles au magasin, et l'inventaire reste vide
 * — donc la recherche, le plan de repas et la liste suivante travaillent sur
 * une réalité fausse.
 *
 * Les dates de péremption sont estimées par l'API : sans elles ces articles
 * n'apparaîtraient jamais dans les alertes.
 *
 * Renvoie le nombre d'articles ajoutés.
 */
export async function addBoughtToFridge(items: ShoppingItem[]): Promise<number> {
  const bought = items.filter((i) => i.checked && i.name.trim());
  if (bought.length === 0) return 0;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Session expirée");

  const names = [...new Set(bought.map((i) => i.name.trim()))];

  // L'estimation est un confort : si elle échoue (quota, réseau, API), on
  // ajoute quand même les articles plutôt que de perdre les courses.
  let expiryDates: Record<string, string | null> = {};
  try {
    const res = await apiFetch("/inventory/shelf-life", {
      method: "POST",
      body: JSON.stringify({ names }),
    });
    expiryDates = res.expiry_dates ?? {};
  } catch {
    expiryDates = {};
  }

  const rows = bought.map((i) => ({
    profile_id: user.id,
    name: i.name.trim(),
    quantity: i.quantity,
    unit: i.unit,
    expiry_date: expiryDates[i.name.trim()] ?? null,
    // L'enum item_source ne connaît que 'photo' et 'manual'. Rien ne lit encore
    // cette colonne : ajouter 'shopping' imposerait une migration pour une
    // information que personne ne consulte.
    source: "manual" as const,
  }));

  const { error } = await supabase.from("inventory_items").insert(rows);
  if (error) throw error;

  notifyInventoryChanged();
  return rows.length;
}
