# -*- coding: utf-8 -*-
"""Génère les images de marque de SmartChef.

    python scripts/og-image.py

Produit :
  public/og.png       1200x630  carte d'aperçu des liens partagés
  public/favicon.png    48x48   onglet du navigateur
  marque/profil.png   1080x1080 photo de profil des réseaux sociaux
  marque/icone.png    1024x1024 icône pour un futur build iOS / Android

Pourquoi un script. Le logo n'existait jusqu'ici que dans le code : un disque
vert avec le glyphe « leaf » de la police Ionicons posé dessus, dessiné à
l'exécution. Rien de téléchargeable, donc pas de favicon, pas de photo de
profil, pas d'icône d'application. Les tracer ici garde les quatre formats
cohérents et permet de tout régénérer quand la marque bouge, au lieu de
retoucher quatre PNG à la main.
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

# Couleurs reprises telles quelles de lib/theme.ts.
FOND = "#EDF4E9"
VERT = "#6FA83C"
VERT_SOMBRE = "#4F7D28"
TEXTE = "#1E2A16"
GRIS = "#5C6B52"
BLANC = "#FFFFFF"

RACINE = Path(__file__).resolve().parent.parent
PUBLIC = RACINE / "public"
MARQUE = RACINE / "marque"


def police(taille: int, gras: bool = False) -> ImageFont.FreeTypeFont:
    """Polices système, avec repli : une image sans la bonne police vaut mieux
    qu'un script qui échoue pendant un build."""
    noms = ["segoeuib.ttf", "arialbd.ttf"] if gras else ["segoeui.ttf", "arial.ttf"]
    for nom in noms:
        try:
            return ImageFont.truetype(nom, taille)
        except OSError:
            continue
    return ImageFont.load_default()


def masque_feuille(taille: int, longueur: float = 0.80, largeur: float = 0.36) -> Image.Image:
    """Une feuille est l'intersection de deux disques décalés en diagonale.

    C'est ce qui donne les deux pointes opposées. Le rayon et l'écart sont
    calculés à partir des proportions voulues, pas choisis à vue : avec des
    valeurs approximatives la forme dépassait du cadre et PIL la coupait net,
    ce qui donnait une feuille au bord plat.

    Les pointes se forment perpendiculairement à l'axe des centres, donc
    `longueur` est l'étendue perpendiculaire et `largeur` celle qui suit cet
    axe. En résolvant 2·√(R² − (d/2)²) = longueur et 2R − d = largeur :

        R = (longueur² + largeur²) / (4 · largeur)

    Tracée à quatre fois la taille puis réduite : PIL n'antialiase pas ses
    tracés, et sans ça les bords sont crénelés.
    """
    f = 4
    t = taille * f
    L, W = longueur * t, largeur * t
    R = (L * L + W * W) / (4 * W)
    d = 2 * R - W

    # Centres posés de part et d'autre du centre du cadre, sur la diagonale.
    ecart = (d / 2) / (2 ** 0.5)
    cx = cy = t / 2
    disques = []
    for signe in (1, -1):
        m = Image.new("L", (t, t), 0)
        x, y = cx + signe * ecart, cy - signe * ecart
        ImageDraw.Draw(m).ellipse((x - R, y - R, x + R, y + R), fill=255)
        disques.append(m)

    return ImageChops.darker(*disques).resize((taille, taille), Image.LANCZOS)


def pastille(cote: int, part_feuille: float = 0.60) -> Image.Image:
    """Le logo seul : disque vert, feuille blanche centrée.

    Rendu à quatre fois la taille puis réduit, pour que le bord du disque soit
    net aussi aux petites tailles — un favicon de 48 px crénelé se voit.
    """
    f = 4
    t = cote * f
    img = Image.new("RGB", (t, t), VERT)
    rond = Image.new("L", (t, t), 0)
    ImageDraw.Draw(rond).ellipse((0, 0, t - 1, t - 1), fill=255)

    taille_feuille = int(t * part_feuille)
    m = masque_feuille(taille_feuille)
    pos = (t - taille_feuille) // 2
    img.paste(Image.new("RGB", m.size, BLANC), (pos, pos), m)

    img.putalpha(rond)
    return img.resize((cote, cote), Image.LANCZOS)


def carte_partage() -> Image.Image:
    """1200x630 : ce que voient LinkedIn, WhatsApp, Facebook et Pinterest."""
    largeur, hauteur = 1200, 630
    img = Image.new("RGB", (largeur, hauteur), FOND)
    d = ImageDraw.Draw(img)

    logo = pastille(108)
    img.paste(logo, (96, 96), logo)
    d.text((230, 112), "SmartChef", font=police(64, gras=True), fill=TEXTE)

    d.text((96, 272), "Prends ton frigo en photo.", font=police(72, gras=True), fill=TEXTE)
    d.text((96, 360), "On te dit quoi cuisiner ce soir", font=police(72, gras=True), fill=VERT_SOMBRE)
    d.text((96, 448), "et ce qui va périmer.", font=police(72, gras=True), fill=VERT_SOMBRE)
    d.text((96, 556), "Gratuit — sans installation", font=police(32), fill=GRIS)

    # Filet vert en pied : cadre l'image quand la plateforme l'affiche sur un
    # fond blanc, où le #EDF4E9 se confondrait presque.
    d.rectangle((0, hauteur - 12, largeur, hauteur), fill=VERT)
    return img


def photo_profil(cote: int = 1080) -> Image.Image:
    """Photo de profil des réseaux.

    Carrée et non détourée : Instagram et TikTok la recadrent eux-mêmes en
    cercle. La pastille est volontairement plus petite que le cadre — un logo
    collé aux bords se fait rogner par ce recadrage.
    """
    img = Image.new("RGB", (cote, cote), FOND)
    logo = pastille(int(cote * 0.78))
    pos = (cote - logo.width) // 2
    img.paste(logo, (pos, pos), logo)
    return img


PUBLIC.mkdir(parents=True, exist_ok=True)
MARQUE.mkdir(parents=True, exist_ok=True)

sorties = [
    (PUBLIC / "og.png", carte_partage()),
    (PUBLIC / "favicon.png", pastille(48).convert("RGBA")),
    (MARQUE / "profil.png", photo_profil()),
    # Les stores refusent une icône transparente : fond plein.
    (MARQUE / "icone.png", pastille(1024).convert("RGB")),
]

for chemin, image in sorties:
    image.save(chemin, "PNG", optimize=True)
    print(f"{chemin.relative_to(RACINE)}  {image.width}x{image.height}  "
          f"{chemin.stat().st_size // 1024} Ko")
