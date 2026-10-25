/**
 * Ajoute les balises de partage dans le HTML exporté.
 *
 * Pourquoi un script plutôt qu'un `app/+html.tsx` : ce fichier n'est lu que
 * par le rendu statique d'expo-router. L'app exporte en SPA, et le passage en
 * `output: "static"` échoue — le client Supabase est construit au chargement
 * du module et réclame un WebSocket absent côté serveur. Rendre ce client
 * paresseux pour obtenir des balises serait disproportionné, donc on écrit
 * dans le HTML produit.
 *
 * Sans ces balises, un lien SmartChef partagé sur LinkedIn, WhatsApp,
 * Facebook ou dans une bio TikTok s'affiche en URL nue, sans titre ni image.
 * C'est le premier contact de la plupart des visiteurs.
 *
 *     node scripts/injecter-meta.mjs [dossier-dist]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIST = process.argv[2] ?? "dist";
const SITE = "https://alpha100bg-eng.github.io/smartchef/";
const TITRE = "SmartChef — prends ton frigo en photo";
const DESCRIPTION =
  "Photographie ton frigo : SmartChef te dit quoi cuisiner ce soir et ce qui va " +
  "périmer. Recettes avec ce que tu as déjà, plan de la semaine et liste de " +
  "courses. Gratuit, sans installation.";

// Les plateformes lisent la page depuis leurs propres serveurs : l'URL de
// l'image doit être absolue, un chemin relatif ne serait pas résolu.
const IMAGE = `${SITE}og.png`;

const BALISES = [
  `<meta name="description" content="${DESCRIPTION}">`,
  `<meta name="theme-color" content="#6FA83C">`,
  // L'onglet n'affichait aucune icône : /favicon.ico renvoyait 404. Chemin
  // relatif ici, contrairement aux images de partage — c'est le navigateur
  // qui le résout, et il connaît déjà le sous-dossier du site.
  `<link rel="icon" type="image/png" href="favicon.png">`,
  `<link rel="apple-touch-icon" href="favicon.png">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:url" content="${SITE}">`,
  `<meta property="og:site_name" content="SmartChef">`,
  `<meta property="og:title" content="${TITRE}">`,
  `<meta property="og:description" content="${DESCRIPTION}">`,
  `<meta property="og:image" content="${IMAGE}">`,
  `<meta property="og:image:width" content="1200">`,
  `<meta property="og:image:height" content="630">`,
  `<meta property="og:image:alt" content="SmartChef — prends ton frigo en photo, on te dit quoi cuisiner ce soir et ce qui va périmer">`,
  `<meta property="og:locale" content="fr_BE">`,
  // L'app parle sept langues ; la carte reste en français parce que le
  // partage vient d'abord de Bruxelles.
  ...["en_US", "es_ES", "pt_BR", "it_IT", "de_DE", "ar_AR"].map(
    (l) => `<meta property="og:locale:alternate" content="${l}">`
  ),
  // Sans « summary_large_image », la carte s'affiche en vignette minuscule.
  `<meta name="twitter:card" content="summary_large_image">`,
  `<meta name="twitter:title" content="${TITRE}">`,
  `<meta name="twitter:description" content="${DESCRIPTION}">`,
  `<meta name="twitter:image" content="${IMAGE}">`,
];

const chemin = join(DIST, "index.html");
if (!existsSync(chemin)) {
  console.error(`introuvable : ${chemin} — lancer l'export avant ce script`);
  process.exit(1);
}

let html = readFileSync(chemin, "utf8");

if (html.includes('property="og:title"')) {
  console.error("les balises sont déjà présentes — script lancé deux fois ?");
  process.exit(1);
}

// Le titre d'app.json est générique ; celui-ci dit ce que fait l'app, et
// c'est lui qui s'affiche dans l'onglet et dans les résultats de recherche.
html = html.replace(/<title>[^<]*<\/title>/, `<title>${TITRE}</title>`);

const insertion = html.indexOf("</head>");
if (insertion === -1) {
  console.error("pas de </head> dans le HTML exporté : rien n'a été modifié");
  process.exit(1);
}

html =
  html.slice(0, insertion) +
  BALISES.map((b) => `    ${b}\n`).join("") +
  html.slice(insertion);

writeFileSync(chemin, html);

// Une image manquante laisserait une carte vide, pire qu'un lien nu.
if (!existsSync(join(DIST, "og.png"))) {
  console.error("og.png absent de l'export : lancer scripts/og-image.py");
  process.exit(1);
}

console.log(`${BALISES.length} balises ajoutées dans ${chemin}`);
