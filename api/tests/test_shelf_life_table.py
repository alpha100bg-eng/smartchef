"""Durées de conservation connues d'avance.

L'enjeu n'est pas que la table réponde — c'est qu'elle ne réponde JAMAIS à la
place du modèle quand elle n'est pas sûre. Une mauvaise date de péremption
déclenche une alerte au mauvais moment, ou pire, n'en déclenche aucune.
"""
from datetime import date
from unittest.mock import patch

import pytest

from app.lang import AR, DE, EN, ES, FR, IT, PT, SUPPORTED
from app.services import shelf_life
from app.services.shelf_life_table import INCONNU, TABLE, chercher


# ── La table répond sur ce qu'elle connaît ──────────────────────────
@pytest.mark.parametrize(
    "nom,lang,attendu",
    [
        ("tomate", FR, 7),
        ("tomates", FR, 7),          # le pluriel passe par normalize()
        ("Tomate", FR, 7),           # la casse aussi
        ("blanc de poulet", FR, 3),  # repli mot à mot
        ("oeufs", FR, 28),
        ("riz", FR, None),           # ne se périme pas
        ("chicken", EN, 3),
        ("tomatoes", EN, 7),
        ("leche", ES, 7),
        ("frango", PT, 3),
        ("pomodoro", IT, 7),
        ("milch", DE, 7),
        ("حليب", AR, 7),
    ],
)
def test_la_table_reconnait(nom, lang, attendu):
    assert chercher(nom, lang) == attendu


# ── Et se tait sur le reste ─────────────────────────────────────────
@pytest.mark.parametrize(
    "nom,lang",
    [
        ("tarte tatin maison", FR),
        ("kimchi", FR),
        ("", FR),
        ("tomate", "ja"),   # langue hors périmètre
    ],
)
def test_la_table_passe_la_main(nom, lang):
    # Rendre une date approximative serait pire que de laisser le modèle
    # répondre : l'alerte de péremption en dépend.
    assert chercher(nom, lang) is INCONNU


def test_non_perissable_n_est_pas_inconnu():
    # `None` veut dire « ne se périme pas », ce qui est une vraie réponse.
    # Les confondre enverrait le riz et le sel au modèle a chaque liste.
    assert chercher("sel", FR) is None
    assert chercher("sel", FR) is not INCONNU


# ── Le modèle n'est appelé que pour ce qui reste ────────────────────
def test_rien_n_est_envoye_au_modele_si_la_table_suffit():
    with patch.object(shelf_life, "_client") as client:
        dates = shelf_life.estimate(["tomate", "riz", "oeufs"], FR)

    client.assert_not_called()  # tout l'intérêt : aucun euro dépensé
    assert dates["riz"] is None
    assert dates["tomate"] is not None


def test_seuls_les_inconnus_partent_au_modele():
    from app.services.shelf_life import ShelfLife, ShelfLifeResult

    faux = ShelfLifeResult(items=[ShelfLife(name="kimchi", days=60)])
    with patch.object(shelf_life, "_client") as client:
        client.return_value.messages.parse.return_value.parsed_output = faux
        dates = shelf_life.estimate(["tomate", "kimchi"], FR)

    envoye = client.return_value.messages.parse.call_args.kwargs["messages"]
    assert envoye[0]["content"] == "kimchi"  # et pas "tomate\nkimchi"
    assert dates["tomate"] is not None       # répondu par la table
    assert dates["kimchi"] is not None       # répondu par le modèle


def test_une_liste_vide_n_appelle_rien():
    with patch.object(shelf_life, "_client") as client:
        assert shelf_life.estimate([], FR) == {}
    client.assert_not_called()


# ── Cohérence de la table elle-même ─────────────────────────────────
def test_chaque_langue_supportee_a_sa_table():
    # Une langue ajoutée sans entrées enverrait tout au modèle en silence.
    assert set(TABLE) == set(SUPPORTED)
    for lang, entrees in TABLE.items():
        assert len(entrees) >= 20, f"{lang} : table trop maigre"


def test_les_durees_restent_dans_les_bornes():
    for lang, entrees in TABLE.items():
        for nom, jours in entrees.items():
            if jours is None:
                continue
            assert shelf_life.MIN_DAYS <= jours <= shelf_life.MAX_DAYS, f"{lang}/{nom}"


def test_aucune_collision_apres_normalisation():
    # Les clés sont normalisées au chargement. Si deux aliments differents se
    # ramenent a la meme forme, le second ecrase silencieusement le premier et
    # l'un des deux rend une duree fausse. Mieux vaut l'apprendre ici.
    from app.services.text_match import normalize

    for lang, entrees in TABLE.items():
        vues: dict[str, str] = {}
        for cle in entrees:
            n = normalize(cle, lang)
            assert n not in vues, f"{lang} : « {cle} » et « {vues[n]} » donnent « {n} »"
            vues[n] = cle


def test_la_date_rendue_est_coherente():
    dates = shelf_life.estimate(["tomate"], FR)
    jour = date.fromisoformat(dates["tomate"])
    assert (jour - date.today()).days == 7
