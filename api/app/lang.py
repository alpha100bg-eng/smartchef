"""Langue de la réponse IA, lue dans l'en-tête `Accept-Language`.

Deux langues seulement : le français reste la référence, l'anglais s'y ajoute.
Un en-tête absent ou inconnu retombe sur le français plutôt que de deviner —
l'app l'envoie systématiquement, donc une absence signale un appel qui ne
vient pas d'elle.
"""
from fastapi import Header

FR = "fr"
EN = "en"
ES = "es"
SUPPORTED = (FR, EN, ES)


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


def pick(lang: str, fr: str, en: str) -> str:
    """Choisit une des deux variantes d'un texte."""
    return en if lang == EN else fr


# Les prompts restent rédigés en français — ils sont longs, réglés finement
# (repères de conservation, exigences de qualité des recettes), et les
# dupliquer les ferait diverger à la première retouche. On leur ajoute une
# consigne de sortie : les modèles la suivent sans difficulté.
#
# Conséquence sur le cache : deux variantes de préfixe au lieu d'une. Les deux
# restent chaudes dès qu'il y a du trafic dans chaque langue.
_CLAUSES = {}

_CLAUSES["en"] = (
    "\n\nLANGUE DE SORTIE : réponds ENTIÈREMENT en anglais. Tous les noms "
    "d'aliments, titres de recettes, étapes, unités et noms de rayons doivent "
    "être en anglais naturel, tel qu'un locuteur natif les écrirait — pas une "
    "traduction littérale du français. Utilise les unités et les habitudes "
    "culinaires anglo-saxonnes quand c'est pertinent."
)

_CLAUSES["es"] = (
    "\n\nLANGUE DE SORTIE : réponds ENTIÈREMENT en espagnol. Tous les noms "
    "d'aliments, titres de recettes, étapes, unités et noms de rayons doivent "
    "être en espagnol naturel, tel qu'un locuteur natif les écrirait — pas une "
    "traduction littérale du français. Utilise les habitudes culinaires et les "
    "noms de produits courants en Espagne."
)


def output_clause(lang: str) -> str:
    """Consigne à concaténer au prompt système. Vide en français, la langue
    d'origine des prompts : le préfixe mis en cache y reste inchangé."""
    return _CLAUSES.get(lang, "")
