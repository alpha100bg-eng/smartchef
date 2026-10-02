/**
 * Prudent food-name normalisation — the JS twin of
 * `api/app/services/text_match.py`. Keep the two in sync: both decide whether
 * a recipe ingredient refers to something already in the fridge.
 *
 * Deliberately conservative: it only resolves obvious matches (case, accents,
 * plain plurals). Anything ambiguous stays unmatched rather than guessing.
 *
 * Bilingue : les règles de pluriel n'ont rien en commun d'une langue à
 * l'autre. Appliquer les règles françaises à « potatoes » donnerait
 * « potatoe », et l'app cesserait de reconnaître ce qui est déjà au frigo.
 */
import { currentLang, type Lang } from "./i18n";

/** Noms dont le singulier et le pluriel sont identiques. */
const INVARIABLES: Record<Lang, Set<string>> = {
  fr: new Set([
    "riz", "ananas", "anchois", "pois", "houmous", "couscous", "jus",
    "radis", "cassis", "mais", "brebis", "souris", "colis",
  ]),
  en: new Set([
    "rice", "fish", "bread", "cheese", "pasta", "hummus", "couscous",
    "juice", "lettuce", "molasses", "asparagus", "sauce", "rice",
  ]),
};

/** Pluriels anglais irréguliers qu'aucune règle ne rattrape. */
const IRREGULIERS_EN: Record<string, string> = {
  leaves: "leaf",
  loaves: "loaf",
  knives: "knife",
  halves: "half",
  shelves: "shelf",
  geese: "goose",
  teeth: "tooth",
  feet: "foot",
  children: "child",
  mice: "mouse",
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function singulariserFr(w: string): string {
  if (INVARIABLES.fr.has(w)) return w;
  // "eaux" avant "aux", sinon gâteaux deviendrait "gateal".
  if (w.endsWith("eaux") && w.length > 5) return w.slice(0, -1);
  if (w.endsWith("aux") && w.length > 4) return w.slice(0, -3) + "al";
  if ((w.endsWith("s") || w.endsWith("x")) && w.length > 4) return w.slice(0, -1);
  return w;
}

function singulariserEn(w: string): string {
  if (INVARIABLES.en.has(w)) return w;
  if (IRREGULIERS_EN[w]) return IRREGULIERS_EN[w];
  // berries -> berry, mais pas boys -> bo
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  // tomatoes -> tomato, boxes -> box, dishes -> dish
  if (/(oes|ses|xes|zes|ches|shes)$/.test(w) && w.length > 4) return w.slice(0, -2);
  // "ss" n'est jamais une marque de pluriel : glass, grass, cress.
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
  return w;
}

export function normalize(name: string, lang: Lang = currentLang()): string {
  const singulariser = lang === "en" ? singulariserEn : singulariserFr;
  return stripAccents(name.toLowerCase())
    .trim()
    .split(/\s+/)
    .map(singulariser)
    .filter(Boolean)
    .join(" ");
}

/** True only on an exact normalised match — the sure case. */
export function sameFood(a: string, b: string, lang: Lang = currentLang()): boolean {
  const na = normalize(a, lang);
  return na.length > 0 && na === normalize(b, lang);
}
