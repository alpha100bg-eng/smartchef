/**
 * Garde-fou : aucun texte visible ou lu à voix haute ne doit être écrit en
 * dur dans un composant.
 *
 * Ces oublis sont invisibles en français — la langue d'origine — et ne se
 * voient qu'en changeant de langue, écran par écran. Six libellés accessibles
 * étaient ainsi restés en français : un utilisateur aveugle en arabe ou en
 * allemand entendait « Retirer la tomate de l'inventaire ».
 *
 * Le test lit les sources plutôt que de rendre les écrans : un rendu ne
 * visite que les chemins qu'il déclenche, alors qu'un bouton codé en dur peut
 * n'apparaître que dans un état rare.
 */
import fs from "fs";
import path from "path";

const RACINE = path.join(__dirname, "..", "..");

function fichiers(dossier: string, extensions: string[]): string[] {
  const base = path.join(RACINE, dossier);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : fichiers(p, extensions);
    return extensions.some((x) => e.name.endsWith(x)) ? [p] : [];
  });
}

/** Les écrans : tout texte entre balises y est visible. */
const SOURCES = ["app", "components"].flatMap((d) => fichiers(d, [".tsx"]));

/**
 * La logique métier. Elle n'affiche rien elle-même, mais ses exceptions
 * remontent telles quelles à l'écran — `setError(e.message)`. Six messages y
 * sont restés en français bien après la traduction de l'app, précisément
 * parce que ce test ne lisait que les `.tsx`.
 */
const MODULES = fichiers("lib", [".ts"]);

test("les sources a verifier sont bien trouvees", () => {
  // Sans cette garde, un test qui ne lit aucun fichier passerait toujours.
  expect(SOURCES.length).toBeGreaterThan(5);
  expect(MODULES.length).toBeGreaterThan(5);
});

test("aucune exception ne porte un message ecrit en dur", () => {
  // `throw new Error("Session expirée")` finit dans `setError(e.message)`,
  // donc à l'écran, en français, quelle que soit la langue choisie.
  const enDur: string[] = [];
  for (const f of MODULES) {
    const lignes = fs.readFileSync(path.join(RACINE, f), "utf8").split("\n");
    lignes.forEach((ligne, i) => {
      const m = ligne.match(/throw new Error\(\s*(?:"([^"]*)"|`([^`]*)`)/);
      if (!m) return;
      const valeur = (m[1] ?? m[2] ?? "").replace(/\$\{[^}]*\}/g, "").trim();
      if (/[\p{L}]{3}/u.test(valeur)) enDur.push(`${f}:${i + 1} → ${valeur}`);
    });
  }
  expect(enDur).toEqual([]);
});

test("aucun libelle accessible n'est ecrit en dur", () => {
  // Accepté : accessibilityLabel={t(...)}, ={plural(...)}, ={uneVariable}.
  // Refusé : ="texte", ={`texte ${x}`} — tout ce qui contient des lettres
  // figées dans une langue.
  const enDur: string[] = [];
  for (const f of SOURCES) {
    const lignes = fs.readFileSync(path.join(RACINE, f), "utf8").split("\n");
    lignes.forEach((ligne, i) => {
      const m = ligne.match(/accessibilityLabel=(?:"([^"]*)"|\{`([^`]*)`)/);
      if (!m) return;
      const valeur = m[1] ?? m[2] ?? "";
      // Un gabarit purement interpolé (`${x}`) ne fige aucun texte.
      const sansInterpolation = valeur.replace(/\$\{[^}]*\}/g, "").trim();
      if (/[a-zA-Zà-öø-ÿ؀-ۿ]/.test(sansInterpolation)) {
        enDur.push(`${f}:${i + 1} → ${valeur}`);
      }
    });
  }
  expect(enDur).toEqual([]);
});

/**
 * Mots qui ne se traduisent pas : nom du produit, devises, unités.
 * Toute autre addition ici doit être un vrai invariant, pas un contournement.
 */
const INVARIANTS = new Set(["SmartChef", "Premium", "SmartChef AI"]);

test("aucun texte affiche n'est ecrit en dur dans le JSX", () => {
  // Première version de ce test : chercher des mots-outils français. Elle
  // laissait passer « Découvrir Premium — {price} €/mois », qui n'en contient
  // aucun. La règle est donc inversée : tout texte littéral entre deux
  // balises est suspect, quelle que soit la langue, car il devrait venir de
  // `t()`. Seuls les invariants ci-dessus échappent.
  const enDur: string[] = [];
  for (const f of SOURCES) {
    const lignes = fs.readFileSync(path.join(RACINE, f), "utf8").split("\n");
    lignes.forEach((ligne, i) => {
      const nue = ligne.trim();
      if (nue.startsWith("//") || nue.startsWith("*") || nue.startsWith("/*")) return;
      for (const m of ligne.matchAll(/>([^<>{}\n][^<>\n]*)</g)) {
        const texte = m[1].replace(/\$?\{[^}]*\}/g, " ").trim();
        // On ne garde que les suites de lettres : « 4,99 », « € », « — »
        // ne figent aucune langue.
        const mots = texte.match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
        const parlants = mots.filter(
          (mot) => mot.length >= 3 && !INVARIANTS.has(mot)
        );
        if (parlants.length > 0) {
          enDur.push(`${f}:${i + 1} → ${texte}`);
        }
      }
    });
  }
  expect(enDur).toEqual([]);
});
