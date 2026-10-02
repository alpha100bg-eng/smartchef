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

from app.lang import EN, FR

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


def normalize(name: str, lang: str = FR) -> str:
    """Lowercase, strip accents, collapse spaces, prudent-singularize each word."""
    singularize = _singularize_en if lang == EN else _singularize_fr
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
