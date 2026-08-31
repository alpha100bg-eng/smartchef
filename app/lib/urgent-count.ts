/**
 * Compteur d'aliments à consommer rapidement, partagé entre la barre d'onglets
 * et les écrans qui modifient l'inventaire.
 *
 * La barre d'onglets est rendue par `_layout`, hors de l'écran « Mon frigo » :
 * elle ne peut pas lire son état local. Sans notification explicite, la
 * pastille afficherait une valeur figée au démarrage — pire que pas de
 * pastille du tout, puisqu'elle prétendrait dire quelque chose de vrai.
 *
 * Un abonnement minimal suffit ; pas besoin d'un gestionnaire d'état global
 * pour un seul entier.
 */
import { useEffect, useState } from "react";

import { supabase } from "./supabase";
import { countUrgent } from "./expiry";

type Listener = (n: number) => void;

let current = 0;
const listeners = new Set<Listener>();

/** Relit l'inventaire et diffuse le nouveau compte. */
export async function refreshUrgentCount(): Promise<number> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("expiry_date");
  // Sur erreur (hors ligne, session expirée) on garde la dernière valeur connue
  // plutôt que d'afficher un zéro rassurant mais faux.
  if (error) return current;
  current = countUrgent(data ?? []);
  listeners.forEach((fn) => fn(current));
  return current;
}

/** À appeler après tout ajout, retrait ou correction de date. */
export function notifyInventoryChanged(): void {
  void refreshUrgentCount();
}

export function useUrgentCount(): number {
  const [count, setCount] = useState(current);

  useEffect(() => {
    listeners.add(setCount);
    void refreshUrgentCount();
    return () => {
      listeners.delete(setCount);
    };
  }, []);

  return count;
}

/** Réservé aux tests — remet le module à zéro entre deux cas. */
export function __resetUrgentCount(): void {
  current = 0;
  listeners.clear();
}
