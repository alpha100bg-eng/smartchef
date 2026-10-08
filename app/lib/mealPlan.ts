import { apiFetch } from "./api";
import { supabase } from "./supabase";
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

/**
 * Le seul appel qui dépasse le délai commun.
 *
 * Mesuré à 56 s : quatorze recettes, leurs ingrédients et le coût estimé en
 * une passe. Le délai par défaut de 60 s ne laisserait aucune marge pour un
 * démarrage à froid, et couper ici est le pire moment — les jetons sont déjà
 * dépensés, l'utilisateur n'a rien. Trois minutes dépassent franchement le
 * pire cas observé tout en restant finies.
 */
const DELAI_PLAN_MS = 180_000;

export async function generateMealPlan(
  weekStart: string,
  budget?: number
): Promise<MealPlanView> {
  return apiFetch(
    "/meal-plan/generate",
    {
      method: "POST",
      body: JSON.stringify({ week_start: weekStart, budget: budget ?? null }),
    },
    DELAI_PLAN_MS
  );
}

/**
 * Budget hebdomadaire du profil.
 *
 * Il n'est plus demandé à l'inscription — cinq champs avant d'avoir rien vu
 * faisaient fuir deux inscrits sur trois. Il est saisi au moment du plan de
 * repas, puis mémorisé pour ne plus être redemandé.
 */
export async function loadBudget(): Promise<number | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("budget_weekly")
    .eq("id", user.id)
    .single();
  return (data?.budget_weekly as number | null) ?? null;
}

export async function rememberBudget(value: number): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // Échec silencieux : le plan vient d'être généré, échouer ici ne doit pas
  // faire croire que la génération a raté.
  await supabase.from("profiles").update({ budget_weekly: value }).eq("id", user.id);
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
