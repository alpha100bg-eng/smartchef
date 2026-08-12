import { apiFetch } from "./api";
import { supabase } from "./supabase";

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
