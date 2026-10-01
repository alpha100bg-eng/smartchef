"""Entonnoir de conversion : inscription → usage → plan de repas → abonnement.

Aucune table dédiée, aucun service externe : chaque table porte déjà
`profile_id` et `created_at`, ce qui suffit à reconstituer le parcours. Une
migration de plus aurait coûté une manipulation pour un gain nul.

    cd smartchef/api && python scripts/entonnoir.py

Lecture avec la clé de service, qui contourne la RLS.
"""
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.supabase_client import get_supabase_admin

# Volumes attendus en dizaines ou centaines : tout charger est plus simple
# qu'agréger côté base. À revoir au-delà de quelques milliers de comptes.
LIMITE = 5000


def _dt(value) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _charger(admin, table: str, colonnes: str) -> list[dict]:
    return admin.table(table).select(colonnes).limit(LIMITE).execute().data or []


def _premiers(rows: list[dict]) -> dict[str, datetime]:
    """profile_id -> date de sa PREMIÈRE ligne dans cette table."""
    out: dict[str, datetime] = {}
    for r in rows:
        pid, d = r.get("profile_id"), _dt(r.get("created_at"))
        if pid and d and (pid not in out or d < out[pid]):
            out[pid] = d
    return out


def _barre(n: int, total: int, largeur: int = 24) -> str:
    if total == 0:
        return ""
    plein = round(largeur * n / total)
    return "█" * plein + "·" * (largeur - plein)


def _etape(libelle: str, ids: set, total: int, reference: set | None = None) -> None:
    n = len(ids)
    pct = f"{100 * n / total:.0f}%" if total else "—"
    ligne = f"  {libelle:<28} {n:>4}  {pct:>4}  {_barre(n, total)}"
    # Le taux de passage depuis l'étape précédente est souvent plus parlant
    # que le pourcentage du total : c'est lui qui désigne où ça coince.
    if reference is not None and reference:
        ligne += f"   ({100 * n / len(reference):.0f}% de l'étape précédente)"
    print(ligne)


def main() -> None:
    admin = get_supabase_admin()
    maintenant = datetime.now(timezone.utc)

    profils = _charger(admin, "profiles", "id, created_at, plan, premium_until, trial_ends_at")
    if not profils:
        print("Aucun compte pour l'instant.")
        return

    inventaire = _premiers(_charger(admin, "inventory_items", "profile_id, created_at"))
    plans = _premiers(_charger(admin, "meal_plans", "profile_id, created_at"))
    courses = _premiers(_charger(admin, "shopping_lists", "profile_id, created_at"))
    recettes = _charger(admin, "recipes", "profile_id, created_at")
    avis = _charger(admin, "feedback", "profile_id, rating, created_at")

    tous = {p["id"] for p in profils}
    total = len(tous)

    # ── L'entonnoir ────────────────────────────────────────────────
    a_scanne = tous & set(inventaire)
    a_planifie = tous & set(plans)
    a_fait_courses = tous & set(courses)
    abonnes = {
        p["id"] for p in profils
        if p.get("plan") == "premium"
        and (_dt(p.get("premium_until")) or maintenant) >= maintenant
    }

    print(f"\nENTONNOIR  ·  {total} compte{'s' if total > 1 else ''}\n")
    _etape("Inscriptions", tous, total)
    _etape("Ont rempli leur frigo", a_scanne, total, tous)
    _etape("Ont généré un plan", a_planifie, total, a_scanne)
    _etape("Ont fait une liste", a_fait_courses, total, a_planifie)
    _etape("Abonnés", abonnes, total, a_planifie)

    # ── L'essai ────────────────────────────────────────────────────
    en_essai, essai_fini = set(), set()
    for p in profils:
        if p["id"] in abonnes:
            continue
        fin = _dt(p.get("trial_ends_at"))
        (en_essai if fin and fin > maintenant else essai_fini).add(p["id"])

    print(f"\nESSAI\n")
    print(f"  En cours                     {len(en_essai):>4}")
    print(f"  Terminé sans abonnement      {len(essai_fini):>4}")
    if essai_fini:
        convertis = len(abonnes)
        base = len(essai_fini) + convertis
        print(f"  Taux de conversion           {100 * convertis / base:>3.0f}%"
              f"   (sur {base} essais arrivés à terme)")
    # Qui a vraiment goûté au Premium avant la fin de son essai ? C'est la
    # question qui décide si l'essai sert à quelque chose.
    gouté = len(en_essai & a_planifie) + len(essai_fini & a_planifie)
    if en_essai or essai_fini:
        print(f"  Ont essayé le plan de repas  {gouté:>4}"
              f"   ← sans ça, l'essai ne sert à rien")

    # ── Activité ───────────────────────────────────────────────────
    derniere: dict[str, datetime] = defaultdict(lambda: datetime.min.replace(tzinfo=timezone.utc))
    for rows in (recettes,):
        for r in rows:
            pid, d = r.get("profile_id"), _dt(r.get("created_at"))
            if pid and d and d > derniere[pid]:
                derniere[pid] = d
    for source in (inventaire, plans, courses):
        for pid, d in source.items():
            if d > derniere[pid]:
                derniere[pid] = d

    actifs_7j = {pid for pid, d in derniere.items() if maintenant - d < timedelta(days=7)}
    print(f"\nACTIVITÉ\n")
    print(f"  Actifs ces 7 derniers jours  {len(actifs_7j):>4}  "
          f"({100 * len(actifs_7j) / total:.0f}%)")

    # Délai entre l'inscription et le premier usage : un délai long signale
    # un onboarding qui décourage.
    delais = []
    for p in profils:
        depart, premier = _dt(p.get("created_at")), inventaire.get(p["id"])
        if depart and premier and premier >= depart:
            delais.append((premier - depart).total_seconds() / 3600)
    if delais:
        delais.sort()
        median = delais[len(delais) // 2]
        unite = f"{median:.0f} h" if median >= 1 else f"{median * 60:.0f} min"
        print(f"  Délai inscription → 1er usage  {unite:>6}  (médiane)")

    jamais = tous - a_scanne
    if jamais:
        print(f"  Inscrits n'ayant jamais rien fait {len(jamais):>3}"
              f"   ← l'onboarding ou la 1re impression")

    # ── Avis ───────────────────────────────────────────────────────
    if avis:
        moyenne = sum(a["rating"] for a in avis) / len(avis)
        print(f"\nAVIS\n\n  {len(avis)} avis · moyenne {moyenne:.1f}/5"
              f"   (détail : python scripts/lire_avis.py)")

    print(
        "\nNON MESURÉ ICI : les écrans vus, les paiements abandonnés en cours\n"
        "de route, et d'où viennent les visiteurs. Il faudrait pour cela\n"
        "enregistrer des événements côté app.\n"
    )


if __name__ == "__main__":
    main()
