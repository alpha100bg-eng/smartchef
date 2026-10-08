import { supabase } from "./supabase";
import { currentLang, t } from "./i18n";

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

/**
 * Délai au-delà duquel on cesse d'attendre.
 *
 * `fetch` n'abandonne jamais de lui-même dans un délai utile : un serveur qui
 * accepte la connexion puis ne répond plus laissait l'utilisateur sur un rond
 * qui tourne, sans message et sans moyen de recommencer.
 *
 * 60 secondes couvre largement une recherche ou une analyse de photo, démarrage
 * à froid de Cloud Run compris. La génération du plan de la semaine est le seul
 * appel réellement long — 56 s mesurées — et demande donc sa propre valeur :
 * l'interrompre à 60 s couperait un appel qui allait aboutir, et facturerait
 * les jetons sans rien rendre.
 */
const DELAI_DEFAUT_MS = 60_000;

/** Reserved for AI-triggering endpoints (vision, meal-plan generation,
 * search). Plain CRUD on profile/inventory/lists goes through Supabase
 * directly, not through this wrapper. */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
  delaiMs: number = DELAI_DEFAUT_MS
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error(t("error.session"));
  }

  const controleur = new AbortController();
  // `expire` distingue notre abandon d'une annulation venue de l'appelant :
  // sans lui, les deux ressortent comme la même AbortError.
  let expire = false;
  const minuteur = setTimeout(() => {
    expire = true;
    controleur.abort();
  }, delaiMs);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controleur.signal,
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
    throw new Error(expire ? t("error.timeout") : t("error.unreachable"));
  } finally {
    clearTimeout(minuteur);
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
