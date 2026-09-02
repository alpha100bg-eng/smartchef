"""Affiche les avis laissés dans l'app.

Lecture avec la clé de service, qui contourne la RLS : l'app ne permet à
personne de lire les avis des autres.

    cd smartchef/api && python scripts/lire_avis.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.supabase_client import get_supabase_admin


def main() -> None:
    rows = (
        get_supabase_admin()
        .table("feedback")
        .select("rating, liked, missing, app_version, created_at")
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )

    if not rows:
        print("Aucun avis pour l'instant.")
        return

    moyenne = sum(r["rating"] for r in rows) / len(rows)
    print(f"{len(rows)} avis · moyenne {moyenne:.1f}/5\n")

    # Répartition des notes : une moyenne de 3 cache soit des tièdes, soit un
    # public qui adore et un autre qui déteste — ce n'est pas la même chose.
    for note in range(5, 0, -1):
        n = sum(1 for r in rows if r["rating"] == note)
        print(f"  {note}★ {'█' * n}{' ' if n else ''}{n or ''}")
    print()

    for r in rows:
        jour = str(r["created_at"])[:10]
        print(f"── {r['rating']}★  {jour}  (v{r.get('app_version') or '?'})")
        if r.get("liked"):
            print(f"   + {r['liked']}")
        if r.get("missing"):
            print(f"   − {r['missing']}")
        print()


if __name__ == "__main__":
    main()
