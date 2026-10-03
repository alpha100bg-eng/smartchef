"""Normalisation anglaise des noms d'aliments.

Ces erreurs-là sont silencieuses : rien ne plante, la liste de courses
rachète simplement ce qui est déjà au frigo, et « J'ai cuisiné ça » ne
retire rien. D'où une couverture serrée.
"""
import pytest

from app.lang import EN, ES, FR
from app.services.text_match import layer1_covered, normalize


@pytest.mark.parametrize("pluriel,singulier", [
    ("tomatoes", "tomato"),
    ("potatoes", "potato"),
    ("berries", "berry"),
    ("strawberries", "strawberry"),
    ("boxes", "box"),
    ("dishes", "dish"),
    ("peaches", "peach"),
    ("carrots", "carrot"),
    ("eggs", "egg"),
    ("leaves", "leaf"),
    ("knives", "knife"),
    ("loaves", "loaf"),
])
def test_english_plurals_resolve(pluriel, singulier):
    assert normalize(pluriel, EN) == normalize(singulier, EN)


@pytest.mark.parametrize("mot", [
    "rice", "fish", "bread", "cheese", "pasta", "couscous", "hummus",
    "lettuce", "asparagus", "juice",
])
def test_english_invariables_are_untouched(mot):
    assert normalize(mot, EN) == mot


@pytest.mark.parametrize("mot", ["glass", "grass", "cress", "swiss"])
def test_a_double_s_is_not_a_plural(mot):
    """Retirer le « s » final de « glass » donnerait « glas » et casserait
    toute correspondance."""
    assert normalize(mot, EN) == mot


def test_short_words_are_left_alone():
    # Raccourcir une racine de trois lettres provoquerait des collisions.
    assert normalize("gas", EN) == "gas"


def test_multi_word_names():
    assert normalize("Green Beans", EN) == "green bean"
    assert normalize("  CHERRY   TOMATOES ", EN) == "cherry tomato"


def test_french_rules_would_mangle_english():
    """La raison d'être de tout ce travail : la règle française transforme
    « potatoes » en « potatoe », et plus rien ne correspond."""
    assert normalize("potatoes", FR) != normalize("potato", FR)
    assert normalize("potatoes", EN) == normalize("potato", EN)


def test_english_rules_would_mangle_french():
    """Symétriquement, la règle anglaise casse « gâteaux »."""
    assert normalize("gâteaux", FR) == normalize("gâteau", FR)
    assert normalize("chevaux", FR) == normalize("cheval", FR)


def test_layer1_matches_across_plural_forms():
    assert layer1_covered("tomatoes", ["Tomato", "milk"], EN)
    assert layer1_covered("Egg", ["eggs"], EN)


def test_layer1_still_refuses_variants():
    """La couche 1 ne tranche que l'évident : « almond milk » n'est pas
    « milk », et ce doute part à la couche sémantique."""
    assert not layer1_covered("almond milk", ["milk"], EN)
    assert not layer1_covered("spring onion", ["onion"], EN)


# ── Espagnol ────────────────────────────────────────────────────────
@pytest.mark.parametrize("pluriel,singulier", [
    ("tomates", "tomate"),
    ("patatas", "patata"),
    ("naranjas", "naranja"),
    ("cebollas", "cebolla"),
    ("huevos", "huevo"),
    ("carnes", "carne"),
    ("limones", "limon"),
    ("panes", "pan"),
    ("nueces", "nuez"),
    ("flores", "flor"),
])
def test_spanish_plurals_resolve(pluriel, singulier):
    assert normalize(pluriel, ES) == normalize(singulier, ES)


def test_the_ambiguous_es_pair():
    """« panes » donne « pan » mais « carnes » donne « carne » : mêmes lettres
    finales, singuliers differents. Aucune regle ne tranche — d'ou la liste
    explicite."""
    assert normalize("panes", ES) == "pan"
    assert normalize("carnes", ES) == "carne"


@pytest.mark.parametrize("mot", ["arroz", "cuscus", "anis", "maiz"])
def test_spanish_invariables(mot):
    assert normalize(mot, ES) == mot


def test_accents_converge_before_singularizing():
    """Les accents sont retires en amont : « limón » et « limones » doivent
    aboutir au meme mot."""
    assert normalize("limón", ES) == normalize("limones", ES)


def test_each_language_would_mangle_the_others():
    assert normalize("tomates", ES) == "tomate"
    assert normalize("tomates", EN) == "tomate"   # -es apres consonne
    assert normalize("tomates", FR) == "tomate"   # -s simple
    # Mais la ou elles divergent vraiment :
    assert normalize("nueces", ES) == "nuez"
    assert normalize("nueces", FR) != "nuez"
