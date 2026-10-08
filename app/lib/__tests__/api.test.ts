/**
 * Le passage obligé de tout appel à l'IA.
 *
 * Ce qui est testé ici n'est pas le chemin heureux mais les pannes : c'est
 * là que l'utilisateur décide si l'app est fiable. Un serveur qui accepte la
 * connexion puis ne répond plus laissait un rond tourner indéfiniment, sans
 * message et sans moyen de recommencer — `fetch` n'abandonne pas de lui-même
 * dans un délai utile.
 */
import { setLang } from "../i18n";
import { STRINGS } from "../strings";

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "jeton-de-test" } },
      }),
    },
  },
}));

import { apiFetch } from "../api";

const vraiFetch = global.fetch;

afterEach(async () => {
  global.fetch = vraiFetch;
  jest.useRealTimers();
  await setLang("fr");
});

function reponse(corps: unknown, init: { status?: number } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => corps,
  } as unknown as Response;
}

test("une requete qui ne repond jamais finit par etre abandonnee", async () => {
  jest.useFakeTimers();
  // Un serveur joignable qui ne répond pas : la promesse ne se règle que si
  // le signal l'interrompt.
  global.fetch = jest.fn(
    (_url, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError"))
        );
      })
  ) as unknown as typeof fetch;

  const appel = apiFetch("/search", { method: "POST" }, 1000);
  // L'ordre des deux lignes suivantes compte, dans les deux sens.
  // `expect(...).rejects` d'abord, pour que le rejet trouve un gestionnaire —
  // sinon il remonte en rejet non géré et fait échouer le test alors que le
  // comportement est correct. Puis la variante *asynchrone* de l'avance :
  // `apiFetch` attend la session avant de poser son minuteur, donc la version
  // synchrone n'avancerait rien du tout.
  const attendu = expect(appel).rejects.toThrow(STRINGS.fr["error.timeout"]);
  await jest.advanceTimersByTimeAsync(1000);
  await attendu;
});

test("le delai depasse ne se confond pas avec un serveur injoignable", async () => {
  // Les deux ressortent comme une erreur de `fetch` : sans distinction, un
  // délai dépassé afficherait « impossible de joindre le serveur », ce qui
  // enverrait l'utilisateur vérifier sa connexion pour rien.
  global.fetch = jest.fn(() =>
    Promise.reject(new TypeError("Failed to fetch"))
  ) as unknown as typeof fetch;

  await expect(apiFetch("/search")).rejects.toThrow(
    STRINGS.fr["error.unreachable"]
  );
});

test("le minuteur est annule quand la reponse arrive", async () => {
  // Sans `clearTimeout`, chaque appel laisserait un minuteur courir jusqu'à
  // son terme — sur mobile, de quoi réveiller le processus pour rien.
  jest.useFakeTimers();
  global.fetch = jest.fn(async () => reponse({ ok: true })) as unknown as typeof fetch;

  await apiFetch("/search");

  expect(jest.getTimerCount()).toBe(0);
});

test("l'appel part dans la langue courante", async () => {
  // L'en-tête décide de la langue des recettes renvoyées par l'IA.
  const espion = jest.fn(async () => reponse({}));
  global.fetch = espion as unknown as typeof fetch;

  await setLang("ar");
  await apiFetch("/search");

  const entetes = (espion.mock.calls[0] as any[])[1].headers;
  expect(entetes["Accept-Language"]).toBe("ar");
});

test("le message du serveur est preferé au code HTTP", async () => {
  // Le backend sait pourquoi il refuse — quota, essai terminé — et le dit
  // dans la langue de l'utilisateur. Le remplacer par « erreur 429 » perdrait
  // exactement l'information qui mène à l'abonnement.
  global.fetch = jest.fn(async () =>
    reponse({ detail: "Tu as utilisé tes 10 recherches du mois." }, { status: 429 })
  ) as unknown as typeof fetch;

  await expect(apiFetch("/search")).rejects.toThrow(
    "Tu as utilisé tes 10 recherches du mois."
  );
});

test("une reponse d'erreur sans corps lisible reste comprehensible", async () => {
  // Une passerelle qui renvoie du HTML, par exemple : il ne faut pas que le
  // parsing échoue en silence.
  global.fetch = jest.fn(async () => ({
    ok: false,
    status: 502,
    json: async () => {
      throw new Error("pas du JSON");
    },
  })) as unknown as typeof fetch;

  await expect(apiFetch("/search")).rejects.toThrow("502");
});
