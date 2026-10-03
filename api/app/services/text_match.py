"""Layer-1 deterministic ingredient matching (Phase 4, F7).

Only resolves OBVIOUS matches: exact equality after case/accent/space
normalization + prudent singularization. Any doubt (variants like "lait" vs
"lait d'amande", "oignon" vs "oignon nouveau") is left UNMATCHED and delegated
to the conservative Haiku layer. No substring/inclusion matching.

Bilingue : les règles de pluriel n'ont rien en commun d'une langue à l'autre.
Appliquer les règles françaises à « potatoes » donnerait « potatoe », et la
liste de courses rachèterait ce qui est déjà au frigo.

Jumeau JS : `app/lib/normalize.ts` — garder les deux en phase.
"""
import unicodedata

from app.lang import EN, ES, FR

# Noms dont le singulier et le pluriel sont identiques.
INVARIABLES = {
    FR: {
        "riz", "ananas", "anchois", "pois", "houmous", "couscous", "jus",
        "radis", "cassis", "maïs", "mais", "brebis", "souris", "colis",
    },
    EN: {
        "rice", "fish", "bread", "cheese", "pasta", "hummus", "couscous",
        "juice", "lettuce", "molasses", "asparagus", "sauce",
    },
    # Mots espagnols deja au singulier qu'une regle amputerait.
    ES: {"cuscus", "anis", "lunes", "paraguas", "cumpleanos", "arroz", "maiz"},
}

# Pluriels anglais irréguliers qu'aucune règle ne rattrape.
IRREGULARS_EN = {
    "leaves": "leaf",
    "loaves": "loaf",
    "knives": "knife",
    "halves": "half",
    "shelves": "shelf",
    "geese": "goose",
    "teeth": "tooth",
    "feet": "foot",
    "children": "child",
    "mice": "mouse",
}

_ES_ENDINGS = ("oes", "ses", "xes", "zes", "ches", "shes")


def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def _singularize_fr(w: str) -> str:
    if w in INVARIABLES[FR]:
        return w
    # Prudent: only touch clearly plural forms, keep a >=4-char stem to avoid
    # collapsing short roots into collisions.
    # "eaux" must be tested before "aux", otherwise "gateaux" matches the
    # -aux/-al rule and becomes "gateal".
    if w.endswith("eaux") and len(w) > 5:
        return w[:-1]  # gâteaux -> gâteau
    if w.endswith("aux") and len(w) > 4:
        return w[:-3] + "al"  # chevaux -> cheval, journaux -> journal
    if w.endswith(("s", "x")) and len(w) > 4:
        return w[:-1]
    return w


def _singularize_en(w: str) -> str:
    if w in INVARIABLES[EN]:
        return w
    if w in IRREGULARS_EN:
        return IRREGULARS_EN[w]
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"  # berries -> berry
    if w.endswith(_ES_ENDINGS) and len(w) > 4:
        return w[:-2]  # tomatoes -> tomato, dishes -> dish
    # "ss" n'est jamais une marque de pluriel : glass, grass, cress.
    if w.endswith("s") and not w.endswith("ss") and len(w) > 3:
        return w[:-1]
    return w


# Pluriels espagnols en "-es" qu'aucune règle ne peut trancher : « panes »
# donne « pan » mais « carnes » donne « carne », avec les mêmes lettres
# finales. Seule une liste explicite évite de mutiler l'un ou l'autre.
IRREGULARS_ES = {
    "limones": "limon",
    "melones": "melon",
    "panes": "pan",
    "flanes": "flan",
    "yogures": "yogur",
    "flores": "flor",
    "coles": "col",
    "champinones": "champinon",
}


def _singularize_es(w: str) -> str:
    """Les accents étant retirés avant cette étape, « limón » et « limones »
    convergent vers « limon ».

    Volontairement prudent, comme les deux autres langues : on ne retire que
    le « -s » après voyelle, qui couvre la grande majorité des aliments
    (tomates, patatas, naranjas, cebollas). Les pluriels en « -es » sont
    ambigus et passent par la liste ci-dessus ou restent tels quels — la
    couche sémantique tranchera.
    """
    if w in INVARIABLES[ES]:
        return w
    if w in IRREGULARS_ES:
        return IRREGULARS_ES[w]
    if w.endswith("ces") and len(w) > 4:
        return w[:-3] + "z"  # nueces -> nuez, peces -> pez
    if w.endswith("s") and len(w) > 3 and w[-2] in "aeiou":
        return w[:-1]  # tomates -> tomate, patatas -> patata
    return w


_SINGULARIZERS = {FR: _singularize_fr, EN: _singularize_en, ES: _singularize_es}


def normalize(name: str, lang: str = FR) -> str:
    """Lowercase, strip accents, collapse spaces, prudent-singularize each word."""
    singularize = _SINGULARIZERS.get(lang, _singularize_fr)
    s = strip_accents(name.lower()).strip()
    words = [singularize(w) for w in s.split()]
    return " ".join(w for w in words if w)


def layer1_covered(plan_ingredient: str, inventory_names: list[str], lang: str = FR) -> bool:
    """True only on an exact normalized match — the sure case. Everything else
    returns False so the caller sends it to the semantic (Haiku) layer."""
    target = normalize(plan_ingredient, lang)
    if not target:
        return False
    return any(normalize(inv, lang) == target for inv in inventory_names)
