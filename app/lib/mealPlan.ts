import { apiFetch } from "./api";
import type { Recipe } from "./search";

export type MealPlanEntry = {
  day: string;
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  /** Nécessaire pour demander la préparation de cette recette précise. */
  recipe_id: string;
  /** `instructions` est vide tant que la recette n'a pas été ouverte. */
  recipe: Recipe & { instructions?: string };
};

export type MealPlanView = {
  id: string;
  week_start: string;
  budget_target: number | null;
  estimated_cost: number | null;
  entries: MealPlanEntry[];
};

/** Monday of the current week, ISO date (YYYY-MM-DD). */
export function currentWeekStart(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

export async function generateMealPlan(
  weekStart: string,
  budget?: number
): Promise<MealPlanView> {
  return apiFetch("/meal-plan/generate", {
    method: "POST",
    body: JSON.stringify({ week_start: weekStart, budget: budget ?? null }),
  });
}

/**
 * Rédige la préparation d'une recette du plan, à sa première ouverture.
 *
 * Le plan ne les génère plus d'un bloc : elles pesaient ~74 % des tokens et
 * tronquaient la réponse. Le texte est conservé côté serveur, donc rouvrir la
 * même recette ne relance aucun appel.
 */
export async function fetchInstructions(recipeId: string): Promise<string> {
  const res = await apiFetch("/meal-plan/instructions", {
    method: "POST",
    body: JSON.stringify({ recipe_id: recipeId }),
  });
  return res.instructions as string;
}
