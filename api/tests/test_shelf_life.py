"""Dérivation de la date de péremption depuis la durée de conservation.

Sans cette étape, `expiry_date` reste null pour presque tous les items — une
date imprimée n'est quasiment jamais lisible sur une photo de frigo — et le
job d'alerte quotidien ne surveille rien.
"""
from datetime import date

from app.models.inventory import DetectedItem, VisionResult
from app.services.vision import fill_expiry_dates

TODAY = date(2026, 3, 10)


def _item(**kwargs) -> DetectedItem:
    base = {"name": "salade", "confidence": 0.9}
    return DetectedItem(**{**base, **kwargs})


def test_derives_a_date_from_shelf_life():
    result = fill_expiry_dates(VisionResult(items=[_item(shelf_life_days=3)]), TODAY)
    assert result.items[0].expiry_date == "2026-03-13"


def test_a_date_read_on_the_package_wins():
    result = fill_expiry_dates(
        VisionResult(items=[_item(expiry_date="2026-04-01", shelf_life_days=3)]), TODAY
    )
    assert result.items[0].expiry_date == "2026-04-01"


def test_no_shelf_life_means_no_expiry():
    # Moutarde, sauces fermées : rien à surveiller, on ne fabrique pas de date.
    result = fill_expiry_dates(VisionResult(items=[_item(shelf_life_days=None)]), TODAY)
    assert result.items[0].expiry_date is None


def test_clamps_absurd_values():
    # 0 déclencherait une alerte le jour même ; 3650 n'alerterait jamais.
    zero = fill_expiry_dates(VisionResult(items=[_item(shelf_life_days=0)]), TODAY)
    assert zero.items[0].expiry_date == "2026-03-11"

    huge = fill_expiry_dates(VisionResult(items=[_item(shelf_life_days=3650)]), TODAY)
    assert huge.items[0].expiry_date == "2027-03-10"


def test_negative_value_does_not_produce_a_past_date():
    result = fill_expiry_dates(VisionResult(items=[_item(shelf_life_days=-5)]), TODAY)
    assert result.items[0].expiry_date == "2026-03-11"


def test_each_item_is_handled_independently():
    result = fill_expiry_dates(
        VisionResult(
            items=[
                _item(name="salade", shelf_life_days=3),
                _item(name="moutarde", shelf_life_days=None),
                _item(name="lait", expiry_date="2026-03-12", shelf_life_days=7),
            ]
        ),
        TODAY,
    )
    assert [i.expiry_date for i in result.items] == ["2026-03-13", None, "2026-03-12"]
