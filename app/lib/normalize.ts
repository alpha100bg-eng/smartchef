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
    "juice", "lettuce", "molasses", "asparagus", "sauce",
  ]),
  // Mots espagnols déjà au singulier qu'une règle amputerait : « cuscús »
  // deviendrait « cuscú », « arroz » est intact mais « anis » perdrait son s.
  es: new Set([
    "cuscus", "anis", "lunes", "paraguas", "cumpleanos", "arroz", "maiz",
  ]),
  pt: new Set(["lapis", "arroz", "cuscuz", "anis", "atum", "pires"]),
  // Beaucoup de singuliers italiens finissent en « -e » : sans cette liste,
  // la règle « -e → -a » en ferait « pesca », « carna », « latta ».
  it: new Set([
    "caffe", "te", "brodo", "riso", "olio", "miele", "pane", "latte",
    "pesce", "carne", "dolce", "sale", "farine", "pepe", "aceto",
  ]),
  de: new Set([
    "reis", "brot", "kase", "butter", "wasser", "zucker", "mehl", "milch",
    "fleisch", "gemuse", "obst", "salz", "ol", "honig", "joghurt",
  ]),
};

const IRREGULIERS_PT: Record<string, string> = {
  limoes: "limao",
  paes: "pao",
  feijoes: "feijao",
  maos: "mao",
  papeis: "papel",
  aneis: "anel",
};

const IRREGULIERS_IT: Record<string, string> = {
  pani: "pane",
  pesci: "pesce",
  formaggi: "formaggio",
  dolci: "dolce",
  uova: "uovo",
};

/** Les trémas disparaissent au retrait des accents : « Äpfel » et « Apfel »
 * convergent déjà sans règle. Restent les pluriels en « -er ». */
const IRREGULIERS_DE: Record<string, string> = {
  eier: "ei",
  glaser: "glas",
  blatter: "blatt",
  hahnchen: "hahnchen",
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

/** Pluriels espagnols en "-es" qu'aucune règle ne peut trancher : « panes »
 * donne « pan » mais « carnes » donne « carne », mêmes lettres finales. */
const IRREGULIERS_ES: Record<string, string> = {
  limones: "limon",
  melones: "melon",
  panes: "pan",
  flanes: "flan",
  yogures: "yogur",
  flores: "flor",
  coles: "col",
  champinones: "champinon",
};

/**
 * Espagnol. Les accents étant retirés avant cette étape, « limón » et
 * « limones » convergent vers « limon ».
 *
 * Volontairement prudent : on ne retire que le « -s » après voyelle, qui
 * couvre la grande majorité des aliments. Les pluriels en « -es » sont
 * ambigus et passent par la liste ci-dessus — la couche sémantique tranchera
 * le reste.
 */
function singulariserEs(w: string): string {
  if (INVARIABLES.es.has(w)) return w;
  if (IRREGULIERS_ES[w]) return IRREGULIERS_ES[w];
  if (w.endsWith("ces") && w.length > 4) return w.slice(0, -3) + "z";
  if (w.endsWith("s") && w.length > 3 && "aeiou".includes(w[w.length - 2])) {
    return w.slice(0, -1);
  }
  return w;
}

/** Portugais. Proche de l'espagnol ; les pluriels en « -ões » / « -ães »
 * passent par la liste, les accents étant déjà retirés. */
function singulariserPt(w: string): string {
  if (INVARIABLES.pt.has(w)) return w;
  if (IRREGULIERS_PT[w]) return IRREGULIERS_PT[w];
  if (w.endsWith("ns") && w.length > 3) return w.slice(0, -2) + "m";
  if (w.endsWith("res") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s") && w.length > 3 && "aeiou".includes(w[w.length - 2])) {
    return w.slice(0, -1);
  }
  return w;
}

/**
 * Italien. Le pluriel change la voyelle finale : « pomodori » → « pomodoro ».
 *
 * Le « -i » est ambigu — il vient de « -o » ou de « -e ». On retient « -o »,
 * de loin le plus fréquent pour les aliments ; la liste rattrape les autres.
 */
function singulariserIt(w: string): string {
  if (INVARIABLES.it.has(w)) return w;
  if (IRREGULIERS_IT[w]) return IRREGULIERS_IT[w];
  // Le « h » ne sert qu'à durcir le c/g devant i ou e : il disparaît quand la
  // voyelle finale redevient a/o. funghi → fungo, amiche → amica.
  if (/(ghi|chi)$/.test(w) && w.length > 4) return w.slice(0, -3) + w[w.length - 3] + "o";
  if (/(ghe|che)$/.test(w) && w.length > 4) return w.slice(0, -3) + w[w.length - 3] + "a";
  if (w.endsWith("i") && w.length > 3) return w.slice(0, -1) + "o";
  if (w.endsWith("e") && w.length > 3) return w.slice(0, -1) + "a";
  return w;
}

/**
 * Allemand, volontairement minimal. Les trémas convergent déjà au retrait des
 * accents. Reste le pluriel en « -n » / « -en », qui couvre l'essentiel des
 * aliments. Les pluriels en « -e » ne sont PAS traités : retirer le « e » de
 * « Tomate » en ferait « Tomat ».
 */
function singulariserDe(w: string): string {
  if (INVARIABLES.de.has(w)) return w;
  if (IRREGULIERS_DE[w]) return IRREGULIERS_DE[w];
  // Les diminutifs en -chen / -lein sont invariables.
  if (/(chen|lein)$/.test(w)) return w;
  if (w.endsWith("n") && w.length > 4 && "eln r".includes(w[w.length - 2])) {
    return w.slice(0, -1);
  }
  return w;
}

const SINGULARISEURS: Record<Lang, (w: string) => string> = {
  fr: singulariserFr,
  en: singulariserEn,
  es: singulariserEs,
  pt: singulariserPt,
  it: singulariserIt,
  de: singulariserDe,
};

export function normalize(name: string, lang: Lang = currentLang()): string {
  const singulariser = SINGULARISEURS[lang] ?? singulariserFr;
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
