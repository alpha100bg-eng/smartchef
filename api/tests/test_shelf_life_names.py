"""Estimation de péremption pour des aliments désignés par leur nom.

Les articles versés dans le frigo depuis la liste de courses n'ont pas d'image :
sans cette estimation, ils entreraient sans date et n'apparaîtraient jamais dans
les alertes.
"""
from datetime import date
from unittest.mock import patch

from app.services.shelf_life import (
    ShelfLife,
    ShelfLifeResult,
    estimate,
    to_expiry_dates,
)

TODAY = date(2026, 3, 10)


def test_converts_days_into_dates():
    result = ShelfLifeResult(
        items=[ShelfLife(name="poulet", days=2), ShelfLife(name="carottes", days=30)]
    )
    assert to_expiry_dates(result, TODAY) == {
        "poulet": "2026-03-12",
        "carottes": "2026-04-09",
    }


def test_non_perishable_stays_without_a_date():
    result = ShelfLifeResult(items=[ShelfLife(name="sel", days=None)])
    assert to_expiry_dates(result, TODAY) == {"sel": None}


def test_clamps_absurd_values_like_the_vision_path():
    result = ShelfLifeResult(
        items=[ShelfLife(name="a", days=0), ShelfLife(name="b", days=99999)]
    )
    assert to_expiry_dates(result, TODAY) == {"a": "2026-03-11", "b": "2027-03-10"}


def test_empty_input_makes_no_api_call():
    with patch("app.services.shelf_life._client") as client:
        assert estimate([]) == {}
    client.assert_not_called()


def test_a_name_the_model_skipped_is_simply_absent():
    # L'appelant insère alors sans date, plutôt qu'avec une date inventée.
    result = ShelfLifeResult(items=[ShelfLife(name="lait", days=7)])
    dates = to_expiry_dates(result, TODAY)
    assert "lait" in dates
    assert "pain" not in dates
