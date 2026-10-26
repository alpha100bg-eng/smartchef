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
      // Un libellé qui n'est QUE le nom de la marque ne se traduit pas : le
      // logo s'annonce « SmartChef » dans toutes les langues. L'exemption
      // exige que chaque mot soit un invariant déclaré, pour qu'une vraie
      // phrase contenant « SmartChef » reste refusée.
      const mots = sansInterpolation.match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
      if (mots.length > 0 && mots.every((mot) => INVARIANTS.has(mot))) return;
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

/**
 * Un `{cond ? (…) : null}` qui s'étale sur plusieurs lignes laisse traîner un
 * « : null} » que la règle prend pour du texte. Ces mots-là ne sont jamais
 * affichés : ce sont des littéraux du langage, pas de la langue.
 */
const MOTS_CLES = new Set(["null", "undefined", "true", "false"]);

/**
 * Efface les expressions `{…}` d'un texte JSX capturé, en partant des plus
 * internes. Ne reste que ce qui est réellement écrit en dur.
 *
 * Les passes successives ne sont pas un luxe : une expression imbriquée —
 * `{cond ? t("k", { a: 1 }) : t("k2")}` — contient des accolades dans des
 * accolades, et un seul `\{[^}]*\}` s'arrête à la première fermante. Il
 * laisse une bouillie où le nom des clés passe pour du texte affiché.
 *
 * À n'appliquer QU'au texte capturé entre deux balises, jamais au fichier
 * entier. Une version précédente comptait la profondeur sur tout le fichier :
 * comme `export default function Ecran() {` ouvre une accolade, tout le JSX
 * se trouvait à une profondeur non nulle et disparaissait. Le test ne lisait
 * plus rien et serait resté vert quoi qu'on écrive.
 */
function sansInterpolations(texte: string): string {
  let avant: string;
  let s = texte;
  do {
    avant = s;
    s = s.replace(/\{[^{}]*\}/g, " ");
  } while (s !== avant);
  return s;
}

test("aucun texte affiche n'est ecrit en dur dans le JSX", () => {
  // Trois versions de cette règle, et chacune a laissé passer de vrais oublis.
  //
  // 1. Chercher des mots-outils français : « Découvrir Premium — {price}
  //    €/mois » n'en contient aucun.
  // 2. Refuser tout littéral entre deux balises, mais ligne par ligne : onze
  //    textes y ont échappé parce qu'un texte un peu long s'écrit sur trois
  //    lignes, `<Text>` sur la première et `</Text>` sur la dernière. Celui
  //    de l'écran frigo s'affichait en français en pleine interface arabe.
  //
  // D'où la version actuelle : le fichier entier est lu d'un bloc, les sauts
  // de ligne compris. Le texte doit se terminer par une balise fermante
  // `</` — sans cette condition, la flèche d'un `() => …` passe pour le
  // début d'un texte et le test crie sur du code.
  const enDur: string[] = [];
  for (const f of SOURCES) {
    const brut = fs.readFileSync(path.join(RACINE, f), "utf8");
    // Les commentaires contiennent des phrases entières, en français de
    // surcroît : sans les retirer, ils noieraient les vrais oublis.
    const src = brut
      .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, " "))
      .replace(/^[ \t]*\/\/.*$/gm, "");

    for (const m of src.matchAll(/>([^<>][^<>]*?)<\//gs)) {
      const texte = sansInterpolations(m[1]).replace(/\s+/g, " ").trim();
      // On ne garde que les suites de lettres : « 4,99 », « € », « — »
      // ne figent aucune langue.
      const mots = texte.match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
      const parlants = mots.filter(
        (mot) =>
          mot.length >= 3 && !INVARIANTS.has(mot) && !MOTS_CLES.has(mot)
      );
      if (parlants.length > 0) {
        const ligne = src.slice(0, m.index).split("\n").length;
        enDur.push(`${f}:${ligne} → ${texte}`);
      }
    }
  }
  expect(enDur).toEqual([]);
});
