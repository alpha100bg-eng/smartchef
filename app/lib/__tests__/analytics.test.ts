/**
 * Mesure du parcours.
 *
 * Ce qui est testé ici n'est pas que les événements partent — c'est qu'ils
 * ne partent PAS quand ils ne doivent pas. Une bibliothèque d'analyse qui
 * s'initialise sans clé, ou qui échoue bruyamment quand un bloqueur de pub
 * la coupe, casse l'app pour une fonction qui n'en est pas une.
 */

const mockInit = jest.fn();
const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockReset = jest.fn();

jest.mock("posthog-js", () => ({
  __esModule: true,
  default: {
    init: (...a: unknown[]) => mockInit(...a),
    capture: (...a: unknown[]) => mockCapture(...a),
    identify: (...a: unknown[]) => mockIdentify(...a),
    reset: () => mockReset(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
});

/** Les tests tournent sans DOM, alors que le module ne s'active que dans un
 * navigateur. On en pose un minimal : c'est aussi la preuve que le garde
 * `surLeWeb` n'est pas decoratif — sans lui, PostHog tenterait de
 * s'initialiser cote natif. */
function dansUnNavigateur() {
  (globalThis as any).window = {};
  (globalThis as any).document = {};
}

/**
 * Recharge le module avec, ou sans, clé configurée.
 *
 * On remplace `analytics-config`, pas `process.env` : Babel substitue les
 * `EXPO_PUBLIC_*` à la transpilation, donc écrire la variable d'environnement
 * pendant le test n'aurait strictement aucun effet — vérifié.
 *
 * `require` et non `import()` : Jest n'exécute pas les imports dynamiques
 * sans --experimental-vm-modules.
 */
function charger(cle?: string): typeof import("../analytics") {
  jest.resetModules();
  jest.doMock("../analytics-config", () => ({
    CLE_POSTHOG: cle,
    HOTE_POSTHOG: "https://eu.i.posthog.com",
  }));
  if (cle) dansUnNavigateur();
  return require("../analytics");
}

test("sans cle, aucun appel n'est fait", async () => {
  const a = charger(undefined);

  a.suivre("scan_lance");
  a.identifier("11111111-1111-1111-1111-111111111111");
  a.oublier();

  expect(mockInit).not.toHaveBeenCalled();
  expect(mockCapture).not.toHaveBeenCalled();
  expect(mockIdentify).not.toHaveBeenCalled();
  // C'est l'état par défaut du dépôt : personne n'a à configurer quoi que ce
  // soit pour développer, et aucune donnée ne fuit depuis un poste local.
});

test("avec une cle, l'evenement part", async () => {
  const a = charger("phc_test");

  a.suivre("scan_reussi", { aliments: 7 });

  expect(mockInit).toHaveBeenCalledTimes(1);
  expect(mockCapture).toHaveBeenCalledWith("scan_reussi", { aliments: 7 });
});

test("la capture automatique et le rejeu de session sont desactives", async () => {
  const a = charger("phc_test");
  a.suivre("scan_lance");

  const options = mockInit.mock.calls[0][1];
  // Chaque evenement est declare dans analytics.ts : rien ne doit partir
  // sans qu'on l'ait ecrit.
  expect(options.autocapture).toBe(false);
  expect(options.capture_pageview).toBe(false);
  // Enregistrer la navigation de quelqu'un ne se decide pas par defaut.
  expect(options.disable_session_recording).toBe(true);
  expect(options.respect_dnt).toBe(true);
});

test("PostHog n'est initialise qu'une fois", async () => {
  const a = charger("phc_test");

  a.suivre("scan_lance");
  a.suivre("scan_reussi");
  a.identifier("22222222-2222-2222-2222-222222222222");

  // Les appels partent en parallele : sans garde, chacun declencherait sa
  // propre initialisation.
  expect(mockInit).toHaveBeenCalledTimes(1);
});

test("l'identifiant est l'UUID du profil, jamais autre chose", async () => {
  const a = charger("phc_test");
  a.identifier("33333333-3333-3333-3333-333333333333");

  expect(mockIdentify).toHaveBeenCalledWith("33333333-3333-3333-3333-333333333333");
  const envoye = JSON.stringify(mockIdentify.mock.calls);
  expect(envoye).not.toMatch(/@/); // aucune adresse e-mail
});

test("un echec de PostHog ne remonte pas d'erreur", () => {
  // Premiere version de ce test : faire echouer le chargement du module.
  // C'etait irrealiste — posthog-js est dans le bundle de l'app, un bloqueur
  // ne peut pas l'empecher de se charger, il bloque l'appel reseau. La vraie
  // defaillance est un init ou un capture qui leve.
  mockInit.mockImplementationOnce(() => {
    throw new Error("hote injoignable");
  });
  const a = charger("phc_test");

  expect(() => a.suivre("scan_lance")).not.toThrow();
  expect(mockCapture).not.toHaveBeenCalled();
});

test("un capture qui leve ne remonte pas non plus", () => {
  mockCapture.mockImplementation(() => {
    throw new Error("requete bloquee");
  });
  const a = charger("phc_test");

  expect(() => a.suivre("scan_reussi", { aliments: 3 })).not.toThrow();
  mockCapture.mockReset();
});
