# -*- coding: utf-8 -*-
"""Génère les images dérivées du logo SmartChef.

    python scripts/og-image.py

Produit :
  public/og.png       1200x630  carte d'aperçu des liens partagés
  public/favicon.png    48x48   onglet du navigateur
  marque/profil.png   1080x1080 photo de profil des réseaux sociaux

Le logo lui-même n'est PAS dessiné ici : il vient du kit d'identité, dans
`assets/`. Ce script ne fait que le décliner aux formats que les plateformes
réclament, pour qu'ils ne divergent pas et qu'une retouche du logo se
propage partout d'un seul coup.

Une version antérieure dessinait une feuille géométrique faute de logo
existant. Le kit l'a remplacée : une toque avec la feuille en creux, qui dit
« cuisine » en plus de « frais ».
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Couleurs du kit (assets/brand/README.md).
VERT = "#1F5E3B"
ORANGE = "#F26A3D"
ENCRE = "#14201A"
BLANC = "#FFFFFF"
FOND = "#F4F5F2"
GRIS = "#5C6B52"

RACINE = Path(__file__).resolve().parent.parent
ASSETS = RACINE / "assets"
PUBLIC = RACINE / "public"
MARQUE = RACINE / "marque"


def police(taille: int, gras: bool = False) -> ImageFont.FreeTypeFont:
    """Polices système, avec repli : une image dans la mauvaise police vaut
    mieux qu'un script qui échoue pendant un build.

    Le kit demande Manrope ExtraBold pour le nom. Elle n'est pas installée
    ici, donc la carte de partage utilise le logo horizontal du kit — qui
    porte déjà le nom composé dans la bonne police — plutôt que de le
    retaper dans une autre.
    """
    noms = ["segoeuib.ttf", "arialbd.ttf"] if gras else ["segoeui.ttf", "arial.ttf"]
    for nom in noms:
        try:
            return ImageFont.truetype(nom, taille)
        except OSError:
            continue
    return ImageFont.load_default()


def charger(nom: str) -> Image.Image:
    chemin = ASSETS / nom
    if not chemin.exists():
        raise SystemExit(f"{chemin} manquant — le kit d'identité doit être dans assets/")
    return Image.open(chemin).convert("RGBA")


def carte_partage() -> Image.Image:
    """1200x630 : ce que voient LinkedIn, WhatsApp, Facebook et Pinterest."""
    largeur, hauteur = 1200, 630
    img = Image.new("RGB", (largeur, hauteur), FOND)
    d = ImageDraw.Draw(img)

    # Le logo horizontal porte déjà le nom dans la police de la marque.
    logo = charger("logo-horizontal.png")
    cible = 420
    logo = logo.resize((cible, round(logo.height * cible / logo.width)), Image.LANCZOS)
    img.paste(logo, (96, 86), logo)

    d.text((96, 268), "Prends ton frigo en photo.", font=police(70, gras=True), fill=ENCRE)
    d.text((96, 354), "On te dit quoi cuisiner ce soir", font=police(70, gras=True), fill=VERT)
    d.text((96, 440), "et ce qui va périmer.", font=police(70, gras=True), fill=VERT)
    d.text((96, 550), "Gratuit — sans installation", font=police(32), fill=GRIS)

    # Filet orange en pied : l'accent de la marque, et un cadre quand la
    # plateforme pose l'image sur un fond blanc où le #F4F5F2 se confondrait.
    d.rectangle((0, hauteur - 12, largeur, hauteur), fill=ORANGE)
    return img


def photo_profil(cote: int = 1080) -> Image.Image:
    """Photo de profil des réseaux.

    L'icône du kit est déjà carrée, sur fond plein : Instagram et TikTok la
    recadrent eux-mêmes en cercle, et le symbole est assez loin des bords
    pour survivre à ce recadrage.
    """
    return charger("icon.png").resize((cote, cote), Image.LANCZOS).convert("RGB")


PUBLIC.mkdir(parents=True, exist_ok=True)
MARQUE.mkdir(parents=True, exist_ok=True)

sorties = [
    (PUBLIC / "og.png", carte_partage()),
    (PUBLIC / "favicon.png", charger("favicon.png")),
    (MARQUE / "profil.png", photo_profil()),
]

for chemin, image in sorties:
    image.save(chemin, "PNG", optimize=True)
    print(f"{chemin.relative_to(RACINE)}  {image.width}x{image.height}  "
          f"{chemin.stat().st_size // 1024} Ko")
