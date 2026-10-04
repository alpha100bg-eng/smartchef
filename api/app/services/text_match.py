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

from app.lang import AR, DE, EN, ES, FR, IT, PT

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
    PT: {"lapis", "arroz", "cuscuz", "anis", "atum", "pires"},
    # Italien : beaucoup de singuliers finissent en « -e » (pesce, carne,
    # latte). Sans cette liste, la regle « -e -> -a » en ferait « pesca »,
    # « carna », « latta ».
    IT: {
        "caffe", "te", "brodo", "riso", "olio", "miele", "pane", "latte",
        "pesce", "carne", "dolce", "sale", "farine", "pepe", "aceto",
    },
    DE: {
        "reis", "brot", "kase", "butter", "wasser", "zucker", "mehl", "milch",
        "fleisch", "gemuse", "obst", "salz", "ol", "honig", "joghurt",
    },
}

# Pluriels portugais que la regle generale manquerait.
IRREGULARS_PT = {
    "limoes": "limao",
    "paes": "pao",
    "feijoes": "feijao",
    "maos": "mao",
    "papeis": "papel",
    "aneis": "anel",
}

# Italien : "-i" vient presque toujours de "-o" pour les aliments
# (pomodori -> pomodoro), "-e" de "-a" (patate -> patata). Les exceptions
# masculines en "-e" demandent une liste.
IRREGULARS_IT = {
    "pani": "pane",
    "pesci": "pesce",
    "formaggi": "formaggio",
    "dolci": "dolce",
    "uova": "uovo",
}

# Allemand : les trémas disparaissent au retrait des accents, donc
# « Äpfel » et « Apfel » convergent deja. Restent les pluriels en "-er".
IRREGULARS_DE = {
    "eier": "ei",
    "glaser": "glas",
    "blatter": "blatt",
    "hahnchen": "hahnchen",  # diminutif : invariable
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


def _singularize_pt(w: str) -> str:
    """Portugais. Proche de l'espagnol, avec les pluriels en « -ões » / « -ães »
    que la liste d'irréguliers couvre (les accents étant déjà retirés)."""
    if w in INVARIABLES[PT]:
        return w
    if w in IRREGULARS_PT:
        return IRREGULARS_PT[w]
    if w.endswith("ns") and len(w) > 3:
        return w[:-2] + "m"  # homens -> homem, nuvens -> nuvem
    if w.endswith("res") and len(w) > 4:
        return w[:-2]  # flores -> flor, colheres -> colher
    if w.endswith("s") and len(w) > 3 and w[-2] in "aeiou":
        return w[:-1]  # tomates -> tomate, bananas -> banana
    return w


def _singularize_it(w: str) -> str:
    """Italien. Le pluriel change la voyelle finale plutôt que d'ajouter une
    lettre : « pomodori » -> « pomodoro », « patate » -> « patata ».

    Le « -i » est ambigu — il vient de « -o » (pomodoro) ou de « -e » (pane).
    On retient « -o », de loin le plus fréquent pour les aliments, et la liste
    d'irréguliers rattrape les autres.
    """
    if w in INVARIABLES[IT]:
        return w
    if w in IRREGULARS_IT:
        return IRREGULARS_IT[w]
    # Le « h » ne sert qu'à durcir le c/g devant i ou e : il disparaît quand
    # la voyelle finale redevient a/o. funghi -> fungo, amiche -> amica.
    if w.endswith(("ghi", "chi")) and len(w) > 4:
        return w[:-3] + w[-3] + "o"
    if w.endswith(("ghe", "che")) and len(w) > 4:
        return w[:-3] + w[-3] + "a"
    if w.endswith("i") and len(w) > 3:
        return w[:-1] + "o"  # pomodori -> pomodoro
    if w.endswith("e") and len(w) > 3:
        return w[:-1] + "a"  # patate -> patata, carote -> carota
    return w


def _singularize_de(w: str) -> str:
    """Allemand, volontairement minimal.

    Les trémas disparaissent au retrait des accents, donc « Äpfel » et
    « Apfel » convergent déjà sans règle. Reste le pluriel en « -n » /« -en »,
    qui couvre l'essentiel des aliments (Tomaten, Zwiebeln, Kartoffeln,
    Bohnen). Les pluriels en « -e » ne sont PAS traités : retirer le « e » de
    « Tomate » en ferait « Tomat ».
    """
    if w in INVARIABLES[DE]:
        return w
    if w in IRREGULARS_DE:
        return IRREGULARS_DE[w]
    # Les diminutifs en -chen / -lein sont invariables : « Hähnchen » reste.
    if w.endswith(("chen", "lein")):
        return w
    if w.endswith("n") and len(w) > 4 and w[-2] in "eln r":
        return w[:-1]  # Tomaten -> Tomate, Zwiebeln -> Zwiebel
    return w


_SINGULARIZERS = {
    FR: _singularize_fr,
    EN: _singularize_en,
    ES: _singularize_es,
    PT: _singularize_pt,
    IT: _singularize_it,
    DE: _singularize_de,
}


# Diacritiques arabes (harakat) et variantes de lettres a unifier.
_AR_HARAKAT = dict.fromkeys(range(0x064B, 0x0653))
_AR_HARAKAT[0x0670] = None
_AR_LETTRES = {0x0622: 0x0627, 0x0623: 0x0627, 0x0625: 0x0627,
               0x0649: 0x064A, 0x0629: 0x0647}


def _normalize_ar(name: str) -> str:
    """Arabe.

    Aucune singularisation : les pluriels brises changent l'interieur du mot
    et aucune regle ne les derive — la couche semantique tranche a leur
    place. Restent trois normalisations sures : retrait des diacritiques,
    unification des formes de l'alef et de la ya, et retrait de l'article
    defini "al" qui distingue inutilement les memes aliments.
    """
    s = name.strip().translate(_AR_HARAKAT).translate(_AR_LETTRES)
    mots = [m[2:] if m.startswith("ال") and len(m) > 4 else m
            for m in s.split()]
    return " ".join(m for m in mots if m)


def normalize(name: str, lang: str = FR) -> str:
    """Lowercase, strip accents, collapse spaces, prudent-singularize each word."""
    if lang == AR:
        return _normalize_ar(name)
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
