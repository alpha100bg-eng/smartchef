# -*- coding: utf-8 -*-
"""Génère l'image d'aperçu des liens partagés (public/og.png, 1200x630).

Un lien SmartChef partagé sur LinkedIn, WhatsApp ou Facebook s'affichait en
URL nue : aucune balise Open Graph, donc aucune carte. Cette image est la
moitié visuelle du correctif ; les balises sont dans `app/+html.tsx`.

1200x630 est le format que lisent toutes les plateformes. Généré par script
plutôt que dessiné à la main pour que le jour où la marque change, une seule
valeur bouge ici.

    python scripts/og-image.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Couleurs reprises telles quelles de lib/theme.ts.
FOND = "#EDF4E9"
VERT = "#6FA83C"
VERT_SOMBRE = "#4F7D28"
TEXTE = "#1E2A16"
GRIS = "#5C6B52"

LARGEUR, HAUTEUR = 1200, 630
SORTIE = Path(__file__).resolve().parent.parent / "public" / "og.png"


def police(taille: int, gras: bool = False) -> ImageFont.FreeTypeFont:
    """Polices système Windows, avec repli : une image sans texte vaut mieux
    qu'un script qui échoue au build."""
    noms = ["segoeuib.ttf", "arialbd.ttf"] if gras else ["segoeui.ttf", "arial.ttf"]
    for nom in noms:
        try:
            return ImageFont.truetype(nom, taille)
        except OSError:
            continue
    return ImageFont.load_default()


img = Image.new("RGB", (LARGEUR, HAUTEUR), FOND)
d = ImageDraw.Draw(img)

# Pastille verte : le même repère visuel que le logo dans l'app.
cx, cy, r = 150, 150, 54
d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=VERT)


def feuille(taille: int, decalage: int) -> Image.Image:
    """Une feuille est l'intersection de deux disques décalés en diagonale.

    Deux parts de camembert donnaient une forme qui ne ressemblait à rien ;
    l'intersection produit les deux pointes opposées caractéristiques. Tracée
    à quatre fois la taille finale puis réduite, pour des bords lisses — PIL
    ne sait pas antialiaser un tracé.
    """
    f = 4
    t, dec = taille * f, decalage * f
    a = Image.new("L", (t, t), 0)
    ImageDraw.Draw(a).ellipse((0, 0, t + dec, t + dec), fill=255)
    b = Image.new("L", (t, t), 0)
    ImageDraw.Draw(b).ellipse((-dec, -dec, t, t), fill=255)
    from PIL import ImageChops

    return ImageChops.darker(a, b).resize((taille, taille), Image.LANCZOS)


masque = feuille(62, 26)
img.paste(Image.new("RGB", masque.size, "#FFFFFF"), (cx - 31, cy - 31), masque)

d.text((230, 112), "SmartChef", font=police(64, gras=True), fill=TEXTE)

d.text(
    (96, 272),
    "Prends ton frigo en photo.",
    font=police(72, gras=True),
    fill=TEXTE,
)
d.text(
    (96, 360),
    "On te dit quoi cuisiner ce soir",
    font=police(72, gras=True),
    fill=VERT_SOMBRE,
)
d.text(
    (96, 448),
    "et ce qui va périmer.",
    font=police(72, gras=True),
    fill=VERT_SOMBRE,
)

d.text((96, 556), "Gratuit — sans installation", font=police(32), fill=GRIS)

# Filet vert en pied de page : cadre l'image quand la plateforme l'affiche
# sur un fond clair, où le #EDF4E9 se confondrait avec le blanc.
d.rectangle((0, HAUTEUR - 12, LARGEUR, HAUTEUR), fill=VERT)

SORTIE.parent.mkdir(parents=True, exist_ok=True)
img.save(SORTIE, "PNG", optimize=True)
print(f"{SORTIE}  {SORTIE.stat().st_size // 1024} Ko")
