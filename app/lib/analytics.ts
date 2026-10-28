/**
 * Mesure du parcours, via PostHog.
 *
 * Raison d'être : sur les trois premiers inscrits, deux n'ont jamais rien
 * fait après l'inscription. Le script d'entonnoir le constate mais ne dit pas
 * *où* ils décrochent — il lit l'état final de la base, pas la suite des
 * gestes. Ces événements comblent exactement ce trou.
 *
 * Trois décisions qui limitent ce qui est collecté, et pourquoi.
 *
 * 1. On ne mesure QUE les utilisateurs connectés. Un visiteur anonyme n'est
 *    jamais suivi, et rien n'est envoyé avant la connexion. Ça restreint la
 *    collecte aux personnes qui utilisent le service, ce qui est le périmètre
 *    le plus étroit répondant quand même à la question posée.
 * 2. L'identifiant est le `profile_id` de Supabase — un UUID. Jamais
 *    l'adresse e-mail, jamais un nom.
 * 3. Aucun contenu utilisateur ne part : ni noms d'aliments, ni requêtes de
 *    recherche, ni recettes. Les événements portent des compteurs et des
 *    catégories, rien qui décrive ce que quelqu'un mange.
 *
 * Sans clé configurée, tout ce module est inerte : aucun appel réseau, aucun
 * stockage. C'est l'état par défaut, y compris en développement.
 *
 * Reste à ta charge : le rejeu de session est désactivé ici, mais PostHog
 * permet de l'activer côté tableau de bord. Ne le fais pas sans traiter le
 * consentement — enregistrer la navigation de quelqu'un ne se décide pas
 * depuis une case à cocher.
 */
import type { PostHog } from "posthog-js";

import { CLE_POSTHOG, HOTE_POSTHOG } from "./analytics-config";

/** Les étapes du parcours, dans l'ordre où elles devraient s'enchaîner. */
export type Evenement =
  | "onboarding_termine"
  | "scan_lance"
  | "scan_reussi"
  | "scan_echoue"
  | "inventaire_rempli"
  | "recherche_lancee"
  | "recette_ouverte"
  | "plan_genere"
  | "liste_generee"
  | "premium_bloque"
  | "paiement_ouvert";

let client: PostHog | null = null;

function surLeWeb(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Initialise PostHog au premier usage, une seule fois.
 *
 * Le module est chargé par `require`, à l'intérieur de la fonction, et non
 * par un `import` en tête de fichier. Raison : posthog-js exécute du code
 * navigateur dès son évaluation — il lit les cookies et pose des écouteurs.
 * Importé en tête, il s'évaluerait donc partout, y compris là où il n'y a pas
 * de navigateur : dans les tests, cinq suites refusaient de démarrer pour
 * cette seule raison, et un futur build natif aurait eu le même problème.
 *
 * Ce n'est pas non plus un `import()` dynamique : Jest ne les exécute pas
 * sans --experimental-vm-modules, et le gain supposé sur le poids du premier
 * chargement était illusoire — l'export Expo produit un bundle unique.
 *
 * Renvoie `false` quand la mesure est inactive — pas de clé, ou pas de
 * navigateur. C'est l'état par défaut du dépôt.
 */
function actif(): boolean {
  if (!CLE_POSTHOG || !surLeWeb()) return false;
  if (client) return true;
  try {
    const module = require("posthog-js");
    const posthog: PostHog = module.default ?? module;
    posthog.init(CLE_POSTHOG, {
      api_host: HOTE_POSTHOG,
      // Pas de capture automatique : chaque événement est déclaré dans ce
      // fichier. Un clic anodin ne doit pas partir sans qu'on l'ait voulu.
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      respect_dnt: true,
    });
    client = posthog;
    return true;
  } catch {
    // Bloqueur de publicité, réseau coupé : la mesure n'est pas une
    // fonctionnalité, son échec ne doit rien interrompre.
    return false;
  }
}

/**
 * Exécute un appel à PostHog en absorbant ses erreurs.
 *
 * La mesure n'est pas une fonctionnalité : si elle échoue, elle doit le faire
 * en silence. Un réseau coupé ou un bloqueur ne doit jamais interrompre un
 * scan en cours.
 */
function sansCasser(appel: () => void): void {
  if (!actif()) return;
  try {
    appel();
  } catch {
    // volontairement ignoré
  }
}

/** À appeler à la connexion. `profileId` est l'UUID Supabase, rien d'autre. */
export function identifier(profileId: string): void {
  sansCasser(() => client?.identify(profileId));
}

/** À appeler à la déconnexion, pour ne pas attribuer la suite au même compte. */
export function oublier(): void {
  sansCasser(() => client?.reset());
}

/**
 * Enregistre une étape franchie.
 *
 * `details` ne doit porter que des nombres et des catégories — jamais un nom
 * d'aliment ni une requête. Le typage ne peut pas l'imposer, la relecture si.
 */
export function suivre(
  evenement: Evenement,
  details?: Record<string, number | string | boolean>
): void {
  sansCasser(() => client?.capture(evenement, details));
}
