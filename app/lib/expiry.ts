/**
 * Urgence de péremption — affichage dans l'app.
 *
 * Les notifications push d'`expo-notifications` exigent une application native
 * installée depuis un store. SmartChef tourne comme page web ajoutée à l'écran
 * d'accueil : elles ne lui parviennent pas. L'alerte doit donc être visible
 * DANS l'app, sinon l'estimation de péremption ne sert à rien.
 *
 * Aucune dépendance à une bibliothèque de dates : on compare des jours
 * calendaires, pas des instants, pour qu'un aliment daté d'aujourd'hui reste
 * « aujourd'hui » quelle que soit l'heure.
 */

export type Urgency = "expired" | "today" | "soon" | "ok" | "unknown";

/** Seuil de « bientôt » : au-delà, l'aliment n'est pas mis en avant. */
export const SOON_DAYS = 3;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Jours calendaires jusqu'à la péremption. Négatif si dépassée, null si la
 * date est absente ou illisible. */
export function daysLeft(expiryDate: string | null, now: Date = new Date()): number | null {
  if (!expiryDate) return null;
  const parsed = new Date(expiryDate);
  if (Number.isNaN(parsed.getTime())) return null;
  const ms = startOfDay(parsed).getTime() - startOfDay(now).getTime();
  return Math.round(ms / 86_400_000);
}

export function urgency(expiryDate: string | null, now: Date = new Date()): Urgency {
  const d = daysLeft(expiryDate, now);
  if (d === null) return "unknown";
  if (d < 0) return "expired";
  if (d === 0) return "today";
  if (d <= SOON_DAYS) return "soon";
  return "ok";
}

/** Texte court affiché sur la pastille de l'aliment. */
export function expiryLabel(expiryDate: string | null, now: Date = new Date()): string | null {
  const d = daysLeft(expiryDate, now);
  if (d === null) return null;
  if (d < -1) return `périmé depuis ${-d} j`;
  if (d === -1) return "périmé d'hier";
  if (d === 0) return "à consommer aujourd'hui";
  if (d === 1) return "demain";
  if (d <= SOON_DAYS) return `dans ${d} jours`;
  return null; // au-delà, on n'encombre pas la liste
}

type WithExpiry = { expiry_date: string | null };

/** Le plus urgent en premier ; les aliments sans date ferment la marche.
 * Trier plutôt que filtrer : l'utilisateur garde la vue complète de son frigo,
 * mais voit d'abord ce qui réclame une décision. */
export function sortByUrgency<T extends WithExpiry>(items: T[], now: Date = new Date()): T[] {
  return [...items].sort((a, b) => {
    const da = daysLeft(a.expiry_date, now);
    const db = daysLeft(b.expiry_date, now);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
}

/** Nombre d'aliments réclamant une action — alimente la pastille de l'onglet. */
export function countUrgent<T extends WithExpiry>(items: T[], now: Date = new Date()): number {
  return items.filter((i) => {
    const u = urgency(i.expiry_date, now);
    return u === "expired" || u === "today" || u === "soon";
  }).length;
}
