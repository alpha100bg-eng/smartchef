/**
 * Avis des utilisateurs.
 *
 * Écrit directement via Supabase (RLS), sans passer par FastAPI : aucune IA
 * n'est impliquée, et l'API est réservée aux appels qui en déclenchent.
 */
import { supabase } from "./supabase";

/** Version de l'app envoyée avec l'avis, pour savoir plus tard si un reproche
 * portait sur quelque chose de déjà corrigé. */
const APP_VERSION = "0.1.0";

export type Feedback = {
  rating: number;
  liked: string;
  missing: string;
};

export async function sendFeedback(f: Feedback): Promise<void> {
  if (f.rating < 1 || f.rating > 5) {
    throw new Error("Choisis une note avant d'envoyer.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Session expirée");

  const { error } = await supabase.from("feedback").insert({
    profile_id: user.id,
    rating: f.rating,
    // Chaînes vides -> null : une colonne vide se lit plus honnêtement qu'un
    // texte vide quand on dépouille les retours.
    liked: f.liked.trim() || null,
    missing: f.missing.trim() || null,
    app_version: APP_VERSION,
  });
  if (error) throw error;
}

/** Un avis a-t-il déjà été laissé ? Sert à remercier plutôt qu'à redemander. */
export async function hasGivenFeedback(): Promise<boolean> {
  const { data, error } = await supabase.from("feedback").select("id").limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}
