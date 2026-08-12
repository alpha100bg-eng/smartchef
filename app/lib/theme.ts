/**
 * SmartChef design system — "frais & vert".
 * Single source of truth for colors, spacing, radii and shadows so every
 * screen stays consistent. No photos: colour, type and icons carry the weight.
 */

export const colors = {
  // Surfaces
  bg: "#EDF4E9", // tinted page background
  card: "#FFFFFF",
  cardMuted: "#F6FAF3",

  // Brand green
  primary: "#6FA83C",
  primaryDark: "#4F7D28",
  primarySoft: "#E4F0D8",

  // Text
  text: "#1E2A16",
  textSecondary: "#5C6B52",
  textMuted: "#93A088",
  onPrimary: "#FFFFFF",

  // Feedback
  warn: "#C98A14",
  warnSoft: "#FDF3DC",
  danger: "#C0492F",
  border: "#E3EBDC",
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
    shadowColor: "#2E3D24",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  button: {
    shadowColor: "#4F7D28",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const;
