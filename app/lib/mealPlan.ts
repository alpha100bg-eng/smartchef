import { apiFetch } from "./api";
import type { Recipe } from "./search";

export type MealPlanEntry = {
  day: string;
  slot: "breakfast" | "lunch" | "dinner" | "snack";
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
