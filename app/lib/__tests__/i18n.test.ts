/**
 * Moteur de traduction.
 *
 * Les erreurs ici sont silencieuses : un écran s'affiche, simplement dans la
 * mauvaise langue ou avec un marqueur `{n}` resté brut.
 */
import { STRINGS } from "../strings";
import { currentLang, setLang, t } from "../i18n";

afterEach(async () => {
  await setLang("fr");
});

test("traduit dans la langue courante", async () => {
  await setLang("fr");
  expect(t("inventory.title")).toBe("Mon frigo");

  await setLang("en");
  expect(t("inventory.title")).toBe("My fridge");
});

test("remplace les marqueurs", async () => {
  await setLang("fr");
  expect(t("inventory.urgentPlural", { n: 3 })).toBe(
    "3 aliments à consommer rapidement"
  );

  await setLang("en");
  expect(t("premium.daysLeft", { n: 5 })).toBe("Full access for 5 more days");
});

test("un marqueur répété est remplacé partout", async () => {
  await setLang("fr");
  // `plan.costBudget` porte deux marqueurs distincts.
  expect(t("plan.costBudget", { cost: 44, budget: 60 })).toBe(
    "Coût estimé : 44 € / budget 60 €"
  );
});

test("setLang change ce que renvoie currentLang", async () => {
  await setLang("en");
  expect(currentLang()).toBe("en");
  await setLang("fr");
  expect(currentLang()).toBe("fr");
});

test("chaque clé française a sa traduction anglaise", () => {
  // Le typage l'impose déjà à la compilation ; ce test attrape le cas où
  // quelqu'un contournerait le type avec un `as`.
  const manquantes = Object.keys(STRINGS.fr).filter(
    (k) => !(k in STRINGS.en) || !STRINGS.en[k as keyof typeof STRINGS.en]
  );
  expect(manquantes).toEqual([]);
});

test("aucune traduction anglaise n'est restée en français", () => {
  // Attrape l'oubli de copier-coller : une valeur anglaise identique au
  // français alors qu'elle contient des caractères typiquement français.
  const suspectes = Object.entries(STRINGS.en)
    .filter(([k, v]) => {
      const fr = STRINGS.fr[k as keyof typeof STRINGS.fr] as string;
      return v === fr && /[àâçéèêëîïôûùœ]/.test(v);
    })
    .map(([k]) => k);
  expect(suspectes).toEqual([]);
});

test("les marqueurs sont les mêmes dans les deux langues", () => {
  // Un `{n}` oublié côté anglais afficherait un nombre manquant.
  const incoherentes: string[] = [];
  for (const [cle, valeurFr] of Object.entries(STRINGS.fr)) {
    const valeurEn = STRINGS.en[cle as keyof typeof STRINGS.en] as string;
    const marqueurs = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(",");
    if (marqueurs(valeurFr as string) !== marqueurs(valeurEn)) {
      incoherentes.push(cle);
    }
  }
  expect(incoherentes).toEqual([]);
});
