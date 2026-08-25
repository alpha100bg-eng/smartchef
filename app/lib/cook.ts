import { supabase } from "./supabase";
import { sameFood } from "./normalize";

/**
 * "I cooked this" — closes the loop. Without it the inventory only ever grows
 * and drifts from reality, which then poisons search, meal plans and the
 * shopping list.
 *
 * Deliberately NOT quantitative: fridge quantities come from vision and are
 * unreliable (measured confidence ≈ 0.36), and units rarely line up
 * ("200 g de riz" vs "1 kg"). Subtracting would be false precision — the user
 * tells us what they finished instead.
 */

export type FridgeMatch = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
};

/** Inventory rows the recipe draws on, matched from its `uses_inventory`. */
export async function matchFridgeItems(usesInventory: string[]): Promise<FridgeMatch[]> {
  if (usesInventory.length === 0) return [];

  const { data, error } = await supabase
    .from("inventory_items")
    .select("id, name, quantity, unit");
  if (error) throw error;

  const rows = (data ?? []) as FridgeMatch[];
  const seen = new Set<string>();
  const matches: FridgeMatch[] = [];
  for (const used of usesInventory) {
    for (const row of rows) {
      if (!seen.has(row.id) && sameFood(row.name, used)) {
        seen.add(row.id);
        matches.push(row);
      }
    }
  }
  return matches;
}

/** Remove the items the user says they finished. */
export async function removeFinished(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from("inventory_items").delete().in("id", ids);
  if (error) throw error;
}
