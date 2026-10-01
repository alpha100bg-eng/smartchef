/**
 * Abonnement Premium.
 *
 * Le palier vient TOUJOURS du serveur. Le front l'affiche et adapte
 * l'interface, mais ne le décide jamais : il suffirait d'ouvrir les outils de
 * développement pour se déclarer abonné. Les routes protégées le revérifient
 * de leur côté, et la colonne `plan` n'est pas modifiable par l'utilisateur,
 * même avec sa propre clé.
 */
import { apiFetch } from "./api";

export type Plan = "free" | "trial" | "premium";

export type BillingStatus = {
  plan: Plan;
  price_eur: string;
  limits: { vision: number; search: number; meal_plan: number; shopping: number };
  used: Partial<Record<"vision" | "search" | "meal_plan" | "shopping", number>>;
  billing_available: boolean;
  /** Jours entiers restants d'essai, 0 hors essai. */
  trial_days_left?: number;
};

/** Le plan de repas et les courses sont ouverts pendant l'essai. */
export function hasFullAccess(status: BillingStatus | null): boolean {
  return status?.plan === "premium" || status?.plan === "trial";
}

export async function fetchBillingStatus(): Promise<BillingStatus> {
  return apiFetch("/billing/status");
}

/** Renvoie l'URL de paiement Stripe vers laquelle rediriger. */
export async function startCheckout(email?: string | null): Promise<string> {
  const res = await apiFetch("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ email: email ?? null }),
  });
  return res.url as string;
}

/** Ce qu'il reste ce mois-ci pour un type d'action. */
export function remaining(status: BillingStatus, kind: keyof BillingStatus["limits"]): number {
  return Math.max(0, status.limits[kind] - (status.used[kind] ?? 0));
}
