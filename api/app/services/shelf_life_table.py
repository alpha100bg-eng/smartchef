"""Durées de conservation connues d'avance, sans appel au modèle.

« Combien de temps se garde une tomate » n'est pas un raisonnement, c'est une
consultation. La réponse est la même pour tout le monde, tout le temps. La
faire calculer par un modèle coûte de l'argent, prend plusieurs secondes,
consomme un quota utilisateur — et donne des résultats qui varient d'un appel
à l'autre pour le même aliment.

Ce module ne remplace PAS le modèle, il le précède. Les noms arrivent en
texte libre et en sept langues (« blanc de poulet », « tomates cerises »,
« حليب ») : aucune table ne couvrira tout, et une table seule ferait
régresser la couverture. Ce qu'elle reconnaît est répondu gratuitement et
instantanément ; le reste part au modèle comme avant.

Les durées reprennent exactement les repères du prompt existant, pour que les
deux chemins ne se contredisent pas.
"""
from app.lang import AR, DE, EN, ES, FR, IT, PT
from app.services.text_match import normalize

# Jours de conservation au réfrigérateur, produit frais non entamé.
# `None` = ne se périme pas en pratique.
HERBES = 4
VIANDE = 3
FRAIS_COURT = 7       # lait, légumes-feuilles
FRAIS_MOYEN = 14      # yaourts, fromage frais
LONGUE = 30           # légumes racines, fromage à pâte dure
OEUFS = 28

# Mots-clés par langue. Un nom correspond si l'un de ses mots normalisés
# figure ici — « blanc de poulet » tombe sur « poulet », « tomates cerises »
# sur « tomate ». On ne liste que ce dont on est sûr : un aliment absent
# part au modèle, ce qui est le comportement d'avant.
TABLE: dict[str, dict[str, int | None]] = {
    FR: {
        "basilic": HERBES, "persil": HERBES, "coriandre": HERBES,
        "menthe": HERBES, "salade": HERBES, "roquette": HERBES,
        "poulet": VIANDE, "boeuf": VIANDE, "porc": VIANDE, "dinde": VIANDE,
        "poisson": VIANDE, "saumon": VIANDE, "cabillaud": VIANDE,
        "crevette": VIANDE, "viande": VIANDE, "hache": VIANDE,
        "lait": FRAIS_COURT, "epinard": FRAIS_COURT, "brocoli": FRAIS_COURT,
        "courgette": FRAIS_COURT, "concombre": FRAIS_COURT,
        "poivron": FRAIS_COURT, "tomate": FRAIS_COURT, "champignon": FRAIS_COURT,
        "yaourt": FRAIS_MOYEN, "creme": FRAIS_MOYEN, "mozzarella": FRAIS_MOYEN,
        "feta": FRAIS_MOYEN, "ricotta": FRAIS_MOYEN, "jambon": FRAIS_MOYEN,
        "beurre": LONGUE, "carotte": LONGUE, "pomme": LONGUE,
        "oignon": LONGUE, "pomme de terre": LONGUE, "patate": LONGUE,
        "gruyere": LONGUE, "comte": LONGUE, "parmesan": LONGUE,
        "oeuf": OEUFS,
        "riz": None, "pate": None, "farine": None, "sucre": None,
        "sel": None, "poivre": None, "huile": None, "vinaigre": None,
        "moutarde": None, "ketchup": None, "conserve": None, "epice": None,
    },
    EN: {
        "basil": HERBES, "parsley": HERBES, "coriander": HERBES,
        "cilantro": HERBES, "mint": HERBES, "lettuce": HERBES, "rocket": HERBES,
        "chicken": VIANDE, "beef": VIANDE, "pork": VIANDE, "turkey": VIANDE,
        "fish": VIANDE, "salmon": VIANDE, "cod": VIANDE, "shrimp": VIANDE,
        "mince": VIANDE, "meat": VIANDE,
        "milk": FRAIS_COURT, "spinach": FRAIS_COURT, "broccoli": FRAIS_COURT,
        "zucchini": FRAIS_COURT, "courgette": FRAIS_COURT,
        "cucumber": FRAIS_COURT, "pepper": FRAIS_COURT, "tomato": FRAIS_COURT,
        "mushroom": FRAIS_COURT,
        "yogurt": FRAIS_MOYEN, "yoghurt": FRAIS_MOYEN, "cream": FRAIS_MOYEN,
        "mozzarella": FRAIS_MOYEN, "feta": FRAIS_MOYEN, "ham": FRAIS_MOYEN,
        "butter": LONGUE, "carrot": LONGUE, "apple": LONGUE,
        "onion": LONGUE, "potato": LONGUE, "cheddar": LONGUE,
        "parmesan": LONGUE,
        "egg": OEUFS,
        "rice": None, "pasta": None, "flour": None, "sugar": None,
        "salt": None, "oil": None, "vinegar": None, "mustard": None,
        "ketchup": None, "spice": None,
    },
    ES: {
        "albahaca": HERBES, "perejil": HERBES, "cilantro": HERBES,
        "menta": HERBES, "lechuga": HERBES,
        "pollo": VIANDE, "ternera": VIANDE, "cerdo": VIANDE, "pavo": VIANDE,
        "pescado": VIANDE, "salmon": VIANDE, "gamba": VIANDE, "carne": VIANDE,
        "leche": FRAIS_COURT, "espinaca": FRAIS_COURT, "brocoli": FRAIS_COURT,
        "calabacin": FRAIS_COURT, "pepino": FRAIS_COURT,
        "pimiento": FRAIS_COURT, "tomate": FRAIS_COURT, "champinon": FRAIS_COURT,
        "yogur": FRAIS_MOYEN, "nata": FRAIS_MOYEN, "mozzarella": FRAIS_MOYEN,
        "jamon": FRAIS_MOYEN,
        "mantequilla": LONGUE, "zanahoria": LONGUE, "manzana": LONGUE,
        "cebolla": LONGUE, "patata": LONGUE, "queso": LONGUE,
        "huevo": OEUFS,
        "arroz": None, "harina": None, "azucar": None, "sal": None,
        "aceite": None, "vinagre": None, "mostaza": None,
    },
    PT: {
        "manjericao": HERBES, "salsa": HERBES, "coentro": HERBES,
        "hortela": HERBES, "alface": HERBES,
        "frango": VIANDE, "carne": VIANDE, "porco": VIANDE, "peru": VIANDE,
        "peixe": VIANDE, "salmao": VIANDE, "camarao": VIANDE,
        "leite": FRAIS_COURT, "espinafre": FRAIS_COURT, "brocolis": FRAIS_COURT,
        "abobrinha": FRAIS_COURT, "pepino": FRAIS_COURT,
        "pimentao": FRAIS_COURT, "tomate": FRAIS_COURT, "cogumelo": FRAIS_COURT,
        "iogurte": FRAIS_MOYEN, "creme": FRAIS_MOYEN, "presunto": FRAIS_MOYEN,
        "manteiga": LONGUE, "cenoura": LONGUE, "maca": LONGUE,
        "cebola": LONGUE, "batata": LONGUE, "queijo": LONGUE,
        "ovo": OEUFS,
        "arroz": None, "farinha": None, "acucar": None, "sal": None,
        "oleo": None, "vinagre": None, "mostarda": None,
    },
    IT: {
        "basilico": HERBES, "prezzemolo": HERBES, "menta": HERBES,
        "lattuga": HERBES, "rucola": HERBES,
        "pollo": VIANDE, "manzo": VIANDE, "maiale": VIANDE, "tacchino": VIANDE,
        "pesce": VIANDE, "salmone": VIANDE, "gambero": VIANDE, "carne": VIANDE,
        "latte": FRAIS_COURT, "spinacio": FRAIS_COURT, "broccolo": FRAIS_COURT,
        "zucchina": FRAIS_COURT, "cetriolo": FRAIS_COURT,
        "peperone": FRAIS_COURT, "pomodoro": FRAIS_COURT, "fungo": FRAIS_COURT,
        "yogurt": FRAIS_MOYEN, "panna": FRAIS_MOYEN, "mozzarella": FRAIS_MOYEN,
        "prosciutto": FRAIS_MOYEN, "ricotta": FRAIS_MOYEN,
        "burro": LONGUE, "carota": LONGUE, "mela": LONGUE,
        "cipolla": LONGUE, "patata": LONGUE, "parmigiano": LONGUE,
        "uovo": OEUFS,
        "riso": None, "pasta": None, "farina": None, "zucchero": None,
        "sale": None, "olio": None, "aceto": None,
    },
    DE: {
        "basilikum": HERBES, "petersilie": HERBES, "minze": HERBES,
        "salat": HERBES, "rucola": HERBES,
        "hahnchen": VIANDE, "rindfleisch": VIANDE, "schwein": VIANDE,
        "pute": VIANDE, "fisch": VIANDE, "lachs": VIANDE, "garnele": VIANDE,
        "fleisch": VIANDE, "hackfleisch": VIANDE,
        "milch": FRAIS_COURT, "spinat": FRAIS_COURT, "brokkoli": FRAIS_COURT,
        "zucchini": FRAIS_COURT, "gurke": FRAIS_COURT,
        "paprika": FRAIS_COURT, "tomate": FRAIS_COURT, "pilz": FRAIS_COURT,
        "joghurt": FRAIS_MOYEN, "sahne": FRAIS_MOYEN, "schinken": FRAIS_MOYEN,
        "butter": LONGUE, "karotte": LONGUE, "mohre": LONGUE, "apfel": LONGUE,
        "zwiebel": LONGUE, "kartoffel": LONGUE, "kase": LONGUE,
        "ei": OEUFS,
        "reis": None, "nudel": None, "mehl": None, "zucker": None,
        "salz": None, "ol": None, "essig": None, "senf": None,
    },
    AR: {
        "ريحان": HERBES, "بقدونس": HERBES, "نعناع": HERBES, "خس": HERBES,
        "دجاج": VIANDE, "لحم": VIANDE, "سمك": VIANDE, "سلمون": VIANDE,
        "جمبري": VIANDE,
        "حليب": FRAIS_COURT, "سبانخ": FRAIS_COURT, "بروكلي": FRAIS_COURT,
        "كوسا": FRAIS_COURT, "خيار": FRAIS_COURT, "فلفل": FRAIS_COURT,
        "طماطم": FRAIS_COURT, "فطر": FRAIS_COURT,
        "لبن": FRAIS_MOYEN, "زبادي": FRAIS_MOYEN, "جبن": FRAIS_MOYEN,
        "زبدة": LONGUE, "جزر": LONGUE, "تفاح": LONGUE, "بصل": LONGUE,
        "بطاطس": LONGUE,
        "بيض": OEUFS,
        "ارز": None, "دقيق": None, "سكر": None, "ملح": None, "زيت": None,
        "خل": None,
    },
}

# Sentinelle : `None` est une réponse valide (« ne se périme pas »), donc
# « absent de la table » ne peut pas se dire avec `None`.
INCONNU = object()


def _normaliser_cles(table: dict[str, dict[str, int | None]]):
    """Passe les clés dans `normalize`, une fois, au chargement.

    `chercher` compare un nom normalisé aux clés : une clé qui ne l'est pas
    ne serait jamais trouvée. Et `normalize` a ses propres bizarreries —
    l'italien « maiale » en ressort « maiala », l'allemand « schinken » en
    ressort « schinke ». Écrire ces formes-là dans la table au-dessus la
    rendrait illisible et donnerait l'impression de fautes de frappe ; on
    écrit donc le mot juste et on applique la même transformation des deux
    côtés.
    """
    return {
        lang: {normalize(cle, lang): jours for cle, jours in entrees.items()}
        for lang, entrees in table.items()
    }


_NORMALISEE = _normaliser_cles(TABLE)


def chercher(nom: str, lang: str = FR) -> int | None | object:
    """Jours de conservation, `None` si non périssable, `INCONNU` si absent.

    On teste d'abord le nom entier, puis chacun de ses mots : « blanc de
    poulet » n'est pas une entrée, « poulet » l'est. Le nom est normalisé avec
    la même fonction que le rapprochement d'ingrédients, donc les pluriels et
    les accents sont déjà gérés.
    """
    entrees = _NORMALISEE.get(lang)
    if not entrees:
        return INCONNU

    normalise = normalize(nom, lang)
    if not normalise:
        return INCONNU
    if normalise in entrees:
        return entrees[normalise]

    # Repli mot à mot, le plus long d'abord. C'est une heuristique, pas une
    # analyse : « jus de pomme » y trouverait « pomme ». Elle reste acceptable
    # parce qu'une erreur donne une date approximative, jamais une donnée
    # fausse ailleurs dans l'app — et parce que les expressions à plusieurs
    # mots dont la durée diffère vraiment sont déjà des entrées entières.
    for mot in sorted(normalise.split(), key=len, reverse=True):
        if mot in entrees:
            return entrees[mot]
    return INCONNU
