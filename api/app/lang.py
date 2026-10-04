"""Langue de la réponse IA, lue dans l'en-tête `Accept-Language`.

Le français reste la référence : c'est la langue d'origine des prompts, et la
seule dont le préfixe mis en cache est inchangé. Un en-tête absent ou inconnu
y retombe plutôt que de deviner — l'app l'envoie systématiquement, donc une
absence signale un appel qui ne vient pas d'elle.
"""
from fastapi import Header

FR = "fr"
EN = "en"
ES = "es"
PT = "pt"
IT = "it"
DE = "de"
AR = "ar"
SUPPORTED = (FR, EN, ES, PT, IT, DE, AR)


def parse(accept_language: str | None) -> str:
    """Première langue reconnue de l'en-tête. `en-GB,fr;q=0.8` -> `en`."""
    if not accept_language:
        return FR
    for morceau in accept_language.split(","):
        code = morceau.split(";")[0].strip().lower()[:2]
        if code in SUPPORTED:
            return code
    return FR


def get_lang(accept_language: str | None = Header(default=None)) -> str:
    """Dépendance FastAPI : injecte la langue dans une route."""
    return parse(accept_language)


# Les prompts restent rédigés en français — ils sont longs, réglés finement
# (repères de conservation, exigences de qualité des recettes), et les
# dupliquer en six langues les ferait diverger à la première retouche. On leur
# ajoute une consigne de sortie : les modèles la suivent sans difficulté.
#
# Conséquence sur le cache : une variante de préfixe par langue. Chacune reste
# chaude dès qu'il y a du trafic dans cette langue, et le français — la plus
# utilisée — garde exactement le préfixe d'origine.
def _clause(langue: str, precision: str) -> str:
    return (
        f"\n\nLANGUE DE SORTIE : réponds ENTIÈREMENT en {langue}. Tous les "
        "noms d'aliments, titres de recettes, étapes, unités et noms de rayons "
        f"doivent être en {langue} naturel, tel qu'un locuteur natif les "
        f"écrirait — pas une traduction littérale du français. {precision}"
    )


_CLAUSES = {
    EN: _clause(
        "anglais",
        "Utilise les unités et les habitudes culinaires anglo-saxonnes quand "
        "c'est pertinent.",
    ),
    ES: _clause(
        "espagnol",
        "Utilise les habitudes culinaires et les noms de produits courants en "
        "Espagne.",
    ),
    PT: _clause(
        "portugais du Brésil",
        "Utilise le vocabulaire et les habitudes culinaires brésiliennes, pas "
        "celles du Portugal.",
    ),
    IT: _clause(
        "italien",
        "Utilise les habitudes culinaires italiennes et les noms de produits "
        "courants en Italie.",
    ),
    AR: _clause(
        "arabe standard moderne",
        "Utilise des noms d'aliments et des habitudes culinaires familiers au "
        "Moyen-Orient et en Afrique du Nord. Chiffres en chiffres arabes "
        "occidentaux (0-9).",
    ),
    DE: _clause(
        "allemand",
        "Utilise les habitudes culinaires allemandes et les noms de produits "
        "courants en Allemagne. Les noms communs prennent une majuscule.",
    ),
}


def output_clause(lang: str) -> str:
    """Consigne à concaténer au prompt système. Vide en français, la langue
    d'origine des prompts : le préfixe mis en cache y reste inchangé."""
    return _CLAUSES.get(lang, "")
