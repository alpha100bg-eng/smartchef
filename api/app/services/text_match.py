"""Layer-1 deterministic ingredient matching (Phase 4, F7).

Only resolves OBVIOUS matches: exact equality after case/accent/space
normalization + prudent French singularization. Any doubt (variants like
"lait" vs "lait d'amande", "oignon" vs "oignon nouveau") is left UNMATCHED and
delegated to the conservative Haiku layer. No substring/inclusion matching.
"""
import unicodedata

# French invariable nouns (same singular/plural) — never strip a trailing s/x.
INVARIABLES = {
    "riz", "ananas", "anchois", "pois", "houmous", "couscous", "jus",
    "radis", "cassis", "maïs", "mais", "brebis", "souris", "colis",
}


def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def _singularize_word(w: str) -> str:
    if w in INVARIABLES:
        return w
    # Prudent: only touch clearly plural forms, keep a >=4-char stem to avoid
    # collapsing short roots into collisions.
    if w.endswith("aux") and len(w) > 4:
        return w[:-3] + "al"  # chevaux -> cheval, journaux -> journal
    if w.endswith(("eaux",)) and len(w) > 5:
        return w[:-1]  # gâteaux -> gâteau
    if w.endswith(("s", "x")) and len(w) > 4:
        return w[:-1]
    return w


def normalize(name: str) -> str:
    """Lowercase, strip accents, collapse spaces, prudent-singularize each word."""
    s = strip_accents(name.lower()).strip()
    words = [_singularize_word(w) for w in s.split()]
    return " ".join(w for w in words if w)


def layer1_covered(plan_ingredient: str, inventory_names: list[str]) -> bool:
    """True only on an exact normalized match — the sure case. Everything else
    returns False so the caller sends it to the semantic (Haiku) layer."""
    target = normalize(plan_ingredient)
    if not target:
        return False
    return any(normalize(inv) == target for inv in inventory_names)
