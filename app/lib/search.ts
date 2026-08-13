import { apiFetch } from "./api";

export type RecipeIngredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
};

/** What the results list shows — fast and cheap to generate. */
export type RecipeSummary = {
  title: string;
  teaser: string;
  prep_time_min: number | null;
  servings: number | null;
  uses_inventory: string[];
};

/** Full recipe, fetched only when the user opens one. */
export type Recipe = RecipeSummary & {
  ingredients: RecipeIngredient[];
  steps: string[];
};

/** Natural-language recipe search (F5) — returns summaries only. */
export async function searchRecipes(query: string): Promise<RecipeSummary[]> {
  const result = await apiFetch("/search", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  return result.recipes as RecipeSummary[];
}

/** Generate the full recipe for one result, on demand. */
export async function fetchRecipeDetail(
  title: string,
  teaser: string
): Promise<Recipe> {
  return apiFetch("/search/detail", {
    method: "POST",
    body: JSON.stringify({ title, teaser }),
  });
}
