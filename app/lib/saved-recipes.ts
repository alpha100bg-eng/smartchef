/**
 * Recettes gardées.
 *
 * Une recette trouvée disparaît dès qu'on ferme l'écran : la retrouver impose
 * une nouvelle recherche IA (~14 s et quelques centimes) sans garantie de
 * retomber sur la même. Garder est donc aussi une économie, pas seulement un
 * confort.
 *
 * Les tables `recipes` et `recipe_ingredients` existent depuis la phase 3 et
 * sont protégées par RLS — aucune migration nécessaire.
 */
import { supabase } from "./supabase";
import type { Recipe, RecipeIngredient } from "./search";

export type SavedRecipe = Recipe & { id: string; created_at: string };

/** Les étapes vivent dans la colonne `instructions` (text), sérialisées en
 * JSON : c'est bien la préparation, et cela évite d'ajouter une colonne pour
 * un tableau de chaînes. */
function encodeSteps(steps: string[]): string {
  return JSON.stringify(steps);
}

function decodeSteps(instructions: string | null): string[] {
  if (!instructions) return [];
  try {
    const parsed = JSON.parse(instructions);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Saisie manuelle ou format antérieur : une étape par ligne.
  }
  return instructions.split("\n").filter((s) => s.trim());
}

export async function saveRecipe(recipe: Recipe): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Session expirée");

  const { data, error } = await supabase
    .from("recipes")
    .insert({
      profile_id: user.id,
      title: recipe.title,
      instructions: encodeSteps(recipe.steps),
      prep_time_min: recipe.prep_time_min,
      servings: recipe.servings,
      generated_by_ai: true,
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;

  if (recipe.ingredients.length > 0) {
    const { error: ingError } = await supabase.from("recipe_ingredients").insert(
      recipe.ingredients.map((i) => ({
        recipe_id: id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
      }))
    );
    // La recette sans ses ingrédients serait inutilisable : on annule plutôt
    // que de laisser une coquille en base.
    if (ingError) {
      await supabase.from("recipes").delete().eq("id", id);
      throw ingError;
    }
  }

  return id;
}

export async function listSavedRecipes(): Promise<SavedRecipe[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select("id, title, instructions, prep_time_min, servings, created_at, recipe_ingredients(name, quantity, unit)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    created_at: r.created_at,
    title: r.title,
    // Le teaser n'est pas conservé : purement décoratif, et le garder
    // imposerait une colonne de plus.
    teaser: "",
    prep_time_min: r.prep_time_min,
    servings: r.servings,
    steps: decodeSteps(r.instructions),
    ingredients: (r.recipe_ingredients ?? []) as RecipeIngredient[],
    // Recalculé à l'affichage depuis le frigo du moment : le figer ici le
    // rendrait faux dès la première course.
    uses_inventory: [],
  }));
}

export async function deleteSavedRecipe(id: string): Promise<void> {
  // recipe_ingredients part en cascade (contrainte de la migration 0003).
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) throw error;
}
