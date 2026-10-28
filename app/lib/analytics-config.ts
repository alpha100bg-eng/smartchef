/**
 * Configuration de la mesure, isolée ici pour une raison précise.
 *
 * Babel remplace `process.env.EXPO_PUBLIC_*` par sa valeur **à la
 * transpilation** : dans le bundle, il ne reste plus une lecture de variable
 * d'environnement mais la chaîne elle-même. C'est ce qui fait fonctionner ces
 * variables côté client — et ce qui rend impossible de les changer à
 * l'exécution. Un test qui écrirait `process.env.EXPO_PUBLIC_POSTHOG_KEY`
 * n'aurait aucun effet, le code ne lit déjà plus `process.env`.
 *
 * Ce fichier existe donc pour concentrer ces constantes en un seul point que
 * les tests peuvent remplacer, sans ouvrir dans `analytics.ts` une porte
 * dérobée qui n'aurait aucune raison d'être en production.
 *
 * La clé de projet PostHog est conçue pour être publique : elle n'autorise
 * que l'envoi d'événements, jamais la lecture. Elle peut donc vivre dans le
 * bundle, contrairement à la clé Anthropic ou à la clé de service Supabase.
 */
export const CLE_POSTHOG = process.env.EXPO_PUBLIC_POSTHOG_KEY;

/** Région européenne par défaut : les données restent dans l'UE, ce qui
 * simplifie la question du transfert hors Union. */
export const HOTE_POSTHOG =
  process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
