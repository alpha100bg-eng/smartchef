import { apiFetch } from "./api";

export type RecipeIngredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
};

export type Recipe = {
  title: string;
  prep_time_min: number | null;
  servings: number | null;
  ingredients: RecipeIngredient[];
  steps: string[];
  uses_inventory: string[];
};

/** Natural-language recipe search (F5). */
export async function searchRecipes(query: string): Promise<Recipe[]> {
  const result = await apiFetch("/search", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  return result.recipes as Recipe[];
}
