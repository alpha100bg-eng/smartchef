import { supabase } from "./supabase";

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

/** Reserved for AI-triggering endpoints (vision, meal-plan generation,
 * search). Plain CRUD on profile/inventory/lists goes through Supabase
 * directly, not through this wrapper. */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Session expirée — reconnecte-toi.");
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...init.headers,
      },
    });
  } catch {
    // fetch only rejects on network-level failures (server down, no route)
    throw new Error(
      "Impossible de joindre le serveur. Vérifie que l'API est démarrée."
    );
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
      throw new Error(detail || "Session expirée — reconnecte-toi.");
    }
    throw new Error(detail || `Le serveur a répondu ${response.status}.`);
  }

  return response.json();
}
