import { supabase } from "./supabase";
import { currentLang, t } from "./i18n";

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

/** Reserved for AI-triggering endpoints (vision, meal-plan generation,
 * search). Plain CRUD on profile/inventory/lists goes through Supabase
 * directly, not through this wrapper. */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error(t("error.session"));
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        // Décide la langue des recettes, des rayons et des noms d'aliments
        // renvoyés par l'IA. L'en-tête standard évite d'ajouter un champ à
        // chaque corps de requête.
        "Accept-Language": currentLang(),
        ...init.headers,
      },
    });
  } catch {
    // fetch only rejects on network-level failures (server down, no route)
    throw new Error(t("error.unreachable"));
  }

  if (!response.ok) {
    // Surface the server's own explanation instead of a bare status code.
    let detail = "";
    try {
      const body = await response.json();
      detail = typeof body?.detail === "string" ? body.detail : "";
    } catch {
      // non-JSON body — fall through to the generic message
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(detail || t("error.session"));
    }
    throw new Error(detail || t("error.server", { code: response.status }));
  }

  return response.json();
}
