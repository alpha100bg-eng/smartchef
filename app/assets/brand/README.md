# SmartChef — Logo (piste « Toque & feuille »)

Pack d'identité visuelle de SmartChef AI. Une toque de chef blanche (cuisine) avec une feuille en creux (fraîcheur, anti-gaspi) et un bandeau orange, sur fond vert sapin.

## Couleurs

| Rôle            | Hex       | Usage                                   |
|-----------------|-----------|-----------------------------------------|
| Vert sapin      | `#1F5E3B` | Couleur principale, fond de l'icône     |
| Orange tomate   | `#F26A3D` | Accent (bandeau de la toque, boutons d'action)|
| Encre           | `#14201A` | Texte principal                         |
| Blanc           | `#FFFFFF` | Toque, texte sur fond vert            |
| Fond clair      | `#F4F5F2` | Arrière-plan neutre de l'app            |

Typographie du nom : **Manrope ExtraBold (800)**, "Smart" en encre, "Chef" en vert sapin.

## Contenu

### `svg/` (sources vectorielles, à privilégier partout où c'est possible)
- `smartchef-icon.svg` : icône avec coins arrondis (web, UI de l'app, réseaux sociaux)
- `smartchef-icon-square.svg` : icône carrée pleine, sans coins arrondis (les stores et iOS arrondissent eux-mêmes)
- `smartchef-mark.svg` : symbole seul sur fond transparent (Android adaptive icon, splash screen)
- `smartchef-logo-horizontal.svg` : icône + nom « SmartChef » (header du site, emails). Le texte nécessite la police Manrope.

### `png/` (prêts à l'emploi pour Expo)
- `icon.png` : 1024×1024, sans transparence (icône app iOS/Android)
- `adaptive-icon.png` : 1024×1024, transparent (premier plan de l'icône adaptative Android)
- `splash-icon.png` : 1024×1024, transparent (écran de démarrage)
- `favicon.png` (48×48) et `favicon.ico` (16/32/48) : version web
- `icon-192.png`, `icon-512.png` : PWA / manifest web
- `logo-horizontal.png` : logo horizontal en haute résolution

## Instructions pour Claude Code

Intègre ce logo dans l'app Expo SmartChef :

1. Copie le contenu de `png/` dans `assets/` (ou `assets/images/` selon la structure existante du projet), et `svg/` dans `assets/brand/`.
2. Mets à jour `app.json` / `app.config` :

```json
{
  "expo": {
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#1F5E3B"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#1F5E3B"
      }
    },
    "web": {
      "favicon": "./assets/favicon.png"
    }
  }
}
```

   Si le projet utilise le plugin `expo-splash-screen`, configure plutôt le splash dans ce plugin avec la même image et la même couleur de fond.
3. Ajoute les couleurs ci-dessus comme tokens dans le thème de l'app (fichier de thème / constantes de couleurs existant) au lieu de les coder en dur.
4. Utilise `smartchef-logo-horizontal.svg` (via `react-native-svg`) dans l'en-tête des écrans d'authentification et de la landing web.
