/**
 * Prudent French name normalisation — the JS twin of
 * `api/app/services/text_match.py`. Keep the two in sync: both decide whether
 * a recipe ingredient refers to something already in the fridge.
 *
 * Deliberately conservative: it only resolves obvious matches (case, accents,
 * plain plurals). Anything ambiguous stays unmatched rather than guessing.
 */

/** French nouns whose singular and plural are identical. */
const INVARIABLES = new Set([
  "riz", "ananas", "anchois", "pois", "houmous", "couscous", "jus",
  "radis", "cassis", "mais", "brebis", "souris", "colis",
]);

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function singularize(w: string): string {
  if (INVARIABLES.has(w)) return w;
  // "eaux" before "aux", otherwise gâteaux would become "gateal".
  if (w.endsWith("eaux") && w.length > 5) return w.slice(0, -1);
  if (w.endsWith("aux") && w.length > 4) return w.slice(0, -3) + "al";
  if ((w.endsWith("s") || w.endsWith("x")) && w.length > 4) return w.slice(0, -1);
  return w;
}

export function normalize(name: string): string {
  return stripAccents(name.toLowerCase())
    .trim()
    .split(/\s+/)
    .map(singularize)
    .filter(Boolean)
    .join(" ");
}

/** True only on an exact normalised match — the sure case. */
export function sameFood(a: string, b: string): boolean {
  const na = normalize(a);
  return na.length > 0 && na === normalize(b);
}
