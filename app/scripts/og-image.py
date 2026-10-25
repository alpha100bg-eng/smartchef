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


def masque_feuille(
    taille: int,
    longueur: float = 0.74,
    largeur: float = 0.40,
    nervures: bool = True,
) -> Image.Image:
    """Masque d'une feuille : limbe, nervures et tige.

    Le limbe est l'intersection de deux disques — c'est ce qui donne les deux
    pointes opposées. Le rayon et l'écart sont calculés à partir des
    proportions voulues, pas choisis à vue : avec des valeurs approximatives
    la forme dépassait du cadre et PIL la coupait net.

    Les pointes se forment perpendiculairement à l'axe des centres, donc
    `longueur` est l'étendue perpendiculaire et `largeur` celle qui suit cet
    axe. En résolvant 2·√(R² − (d/2)²) = longueur et 2R − d = largeur :

        R = (longueur² + largeur²) / (4 · largeur)

    Tout est tracé feuille verticale, pointe en haut : les nervures s'y
    calculent en deux lignes, alors qu'en diagonale il faudrait projeter
    chaque point. L'inclinaison vient d'une rotation à la fin.

    Sans nervures ni tige, la forme se lit « œil » ou « ballon », pas
    « feuille ». `nervures=False` existe pour les très petites tailles, où des
    traits de deux pixels disparaissent au rééchantillonnage et ne font que
    salir la forme.

    Tracé à quatre fois la taille puis réduit : PIL n'antialiase pas ses
    tracés, et sans ça les bords sont crénelés.
    """
    f = 4
    t = taille * f
    L, W = longueur * t, largeur * t
    R = (L * L + W * W) / (4 * W)
    d = 2 * R - W

    cx, cy = t / 2, t / 2
    # La tige pousse vers le bas : on remonte la feuille pour que l'ensemble
    # reste centré dans le cadre.
    tige = t * 0.11
    cy -= tige / 2

    limbe = Image.new("L", (t, t), 0)
    disques = []
    for signe in (1, -1):
        m = Image.new("L", (t, t), 0)
        x = cx + signe * d / 2
        ImageDraw.Draw(m).ellipse((x - R, cy - R, x + R, cy + R), fill=255)
        disques.append(m)
    limbe = ImageChops.darker(*disques)

    haut, bas = cy - L / 2, cy + L / 2

    # Tige : prolonge la feuille sous sa base, légèrement incurvée pour ne pas
    # avoir l'air d'un clou planté dans le limbe.
    d_limbe = ImageDraw.Draw(limbe)
    d_limbe.line(
        [
            (cx, bas - t * 0.03),
            (cx + t * 0.010, bas + tige * 0.45),
            (cx + t * 0.032, bas + tige * 0.85),
            (cx + t * 0.060, bas + tige),
        ],
        fill=255,
        width=int(t * 0.040),
        joint="curve",
    )

    if not nervures:
        return limbe.resize((taille, taille), Image.LANCZOS)

    # Les nervures sont retirées du limbe : le vert du disque réapparaît par
    # ces traits. Dessinées à part puis limitées au limbe, sinon elles
    # dépasseraient du bord.
    creux = Image.new("L", (t, t), 0)
    dc = ImageDraw.Draw(creux)
    epaisseur = max(2, int(t * 0.016))

    dc.line([(cx, haut + L * 0.06), (cx, bas - L * 0.02)], fill=255, width=epaisseur)

    # Cinq paires de nervures latérales, qui raccourcissent vers la pointe —
    # c'est cette décroissance qui fait lire la nervation. Elles s'arrêtent
    # avant le bord : une nervure qui touche le contour le coupe et isole un
    # éclat blanc, ce qui casse la silhouette au lieu de la décrire.
    for i in range(5):
        p = 0.20 + i * 0.135           # position le long de la nervure centrale
        y = bas - L * p
        portee = W * 0.46 * (1 - p * 0.55)
        for signe in (1, -1):
            dc.line(
                [(cx, y), (cx + signe * portee, y - portee * 0.90)],
                fill=255,
                width=max(2, int(epaisseur * 0.7)),
            )

    creux = ImageChops.darker(creux, limbe)
    return ImageChops.subtract(limbe, creux).resize((taille, taille), Image.LANCZOS)


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
    # En dessous d'une quarantaine de pixels à l'écran, les nervures ne font
    # plus que troubler la silhouette : le favicon garde une feuille pleine.
    m = masque_feuille(taille_feuille, nervures=cote >= 96)
    # Penchée : une feuille strictement verticale a l'air d'un pictogramme de
    # signalisation. L'expansion est désactivée pour que la rotation ne
    # change pas la taille du masque.
    m = m.rotate(-32, resample=Image.BICUBIC, expand=False)
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
