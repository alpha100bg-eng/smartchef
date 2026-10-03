/**
 * Français / anglais.
 *
 * Pas de bibliothèque : une cinquantaine de clés ne justifie pas une
 * dépendance de plus, et le bundle est déjà à 1,8 Mo.
 *
 * `t()` doit être synchrone pour s'appeler pendant le rendu, alors que la
 * préférence est stockée de façon asynchrone. La langue vit donc dans une
 * variable de module, initialisée depuis l'appareil puis corrigée au
 * démarrage si l'utilisateur en a choisi une — même approche que le compteur
 * de l'onglet Frigo.
 */
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { STRINGS, type Key } from "./strings";

export type Lang = "fr" | "en" | "es";

const CLEF = "smartchef_lang";

/** Langue de l'appareil. Sur le web, `navigator.language` ; ailleurs on
 * retombe sur le français, langue d'origine de l'app. */
function langueAppareil(): Lang {
  try {
    const n =
      typeof navigator !== "undefined" ? navigator.language ?? "" : "";
    const code = n.toLowerCase().slice(0, 2);
    return code === "en" || code === "es" ? code : "fr";
  } catch {
    return "fr";
  }
}

let courante: Lang = langueAppareil();
const abonnes = new Set<(l: Lang) => void>();

export function currentLang(): Lang {
  return courante;
}

/** À appeler une fois au démarrage : applique le choix mémorisé s'il existe. */
export async function initLang(): Promise<void> {
  try {
    const stocke = await AsyncStorage.getItem(CLEF);
    if (stocke === "fr" || stocke === "en" || stocke === "es") {
      courante = stocke;
      abonnes.forEach((f) => f(courante));
    }
  } catch {
    // Stockage indisponible : la langue de l'appareil fait l'affaire.
  }
}

export async function setLang(l: Lang): Promise<void> {
  courante = l;
  abonnes.forEach((f) => f(l));
  try {
    await AsyncStorage.setItem(CLEF, l);
  } catch {
    // Le changement reste actif pour cette session, simplement non mémorisé.
  }
}

/** Fait re-rendre un écran quand la langue change. */
export function useLang(): Lang {
  const [l, setL] = useState(courante);
  useEffect(() => {
    abonnes.add(setL);
    return () => {
      abonnes.delete(setL);
    };
  }, []);
  return l;
}

/**
 * Texte traduit. `vars` remplace les marqueurs `{nom}`.
 *
 * Une clé manquante renvoie la clé elle-même plutôt qu'un vide : un écran
 * affichant `inventory.title` se repère immédiatement, un écran vide non.
 */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const table = STRINGS[courante] ?? STRINGS.fr;
  let texte = table[key] ?? STRINGS.fr[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      texte = texte.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return texte;
}

/** Pluriel simple : les deux langues marquent le pluriel au-delà de 1. */
export function plural(n: number, un: Key, plusieurs: Key, vars?: Record<string, string | number>): string {
  return t(n > 1 ? plusieurs : un, { n, ...vars });
}
