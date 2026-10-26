/**
 * SmartChef design system — « toque & feuille ».
 * Single source of truth for colors, spacing, radii and shadows so every
 * screen stays consistent. No photos: colour, type and icons carry the weight.
 *
 * Les couleurs viennent du kit d'identité (`assets/brand/README.md`). L'app
 * tournait auparavant dans un vert clair sans rapport avec le logo : deux
 * verts différents à l'écran, ce qui se lit comme une erreur plutôt que comme
 * une intention.
 */

export const colors = {
  // Surfaces
  bg: "#F4F5F2", // fond neutre du kit
  card: "#FFFFFF",
  cardMuted: "#F0F3EE",

  // Vert sapin de la marque
  primary: "#1F5E3B",
  primaryDark: "#164429",
  // Teinte claire du vert sapin, pour les pastilles d'icônes et les fonds
  // discrets. Calculée depuis `primary`, pas choisie à part, sinon elle
  // dérive à la première retouche.
  primarySoft: "#DCE8E0",

  // L'accent de la marque. Il n'existait pas avant : tout était vert, donc
  // rien ne ressortait. Réservé à ce qui appelle une action.
  accent: "#F26A3D",
  accentSoft: "#FDE6DD",

  // Text
  text: "#14201A", // encre du kit
  textSecondary: "#55605A",
  textMuted: "#8A958E",
  onPrimary: "#FFFFFF",

  // Feedback
  warn: "#C98A14",
  warnSoft: "#FDF3DC",
  // Le danger doit rester distinct de l'orange d'accent : plus sombre et
  // plus rouge, sinon « supprimer » ressemble à « valider ».
  danger: "#B3341C",
  border: "#E2E6E0",
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
} as const;

export const font = {
  title: 26,
  heading: 19,
  body: 15,
  small: 13,
  tiny: 11,
} as const;

/** Soft elevation — the reference design's signature. */
export const shadow = {
  card: {
    shadowColor: "#1A241E",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  button: {
    // Teintée du vert de la marque plutôt que grise : une ombre neutre sous
    // un bouton coloré le fait paraître posé par-dessus la page.
    shadowColor: "#1F5E3B",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const;
