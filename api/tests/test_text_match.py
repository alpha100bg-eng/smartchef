from app.services.text_match import normalize, layer1_covered


def test_normalize_case_accents_plural():
    assert normalize("Tomates") == "tomate"
    assert normalize("OIGNONS") == "oignon"
    assert normalize("Œufs".replace("Œ", "OE")) == "oeuf"
    assert normalize("  Poivron   Rouge ") == "poivron rouge"


def test_invariables_not_stripped():
    assert normalize("riz") == "riz"
    assert normalize("ananas") == "ananas"
    assert normalize("jus") == "jus"


def test_layer1_matches_obvious_only():
    inv = ["tomates", "oignon", "riz"]
    # obvious: case/plural differences resolve
    assert layer1_covered("Tomates cerises", inv) is False  # "tomate cerise" != "tomate"
    assert layer1_covered("Tomates", inv) is True
    assert layer1_covered("oignons", inv) is True
    assert layer1_covered("RIZ", inv) is True


def test_layer1_delegates_variants_to_layer2():
    inv = ["lait", "oignon"]
    # these must NOT be resolved by layer 1 (no inclusion) — go to Haiku
    assert layer1_covered("lait d'amande", inv) is False
    assert layer1_covered("oignon nouveau", inv) is False


def test_plural_endings():
    # "eaux" must win over "aux", otherwise gâteaux -> "gateal"
    assert normalize("gâteaux") == "gateau"
    assert normalize("chevaux") == "cheval"
    assert normalize("journaux") == "journal"


def test_short_roots_not_over_stripped():
    # prudent: don't collapse very short words
    assert normalize("pois") == "pois"  # invariable
    assert layer1_covered("ail", ["ail"]) is True
