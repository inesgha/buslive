/**
 * Jetons de design de BusLive (d'après la maquette).
 * Toutes les couleurs de l'app passent par ici : ne jamais écrire une couleur
 * en dur dans un composant, sinon le mode sombre ne s'appliquera pas.
 */

export const palette = {
  busYellow: '#FFC52E',
  nightBlue: '#0E1B2C',
  mist: '#F3F5F4',
  white: '#FFFFFF',
} as const;

export interface ThemeColors {
  /** Fond des écrans. */
  background: string;
  /** Fond des cartes et de la barre d'onglets. */
  card: string;
  /** Texte principal et éléments forts. */
  text: string;
  /** Texte secondaire (légendes, aides). */
  textMuted: string;
  border: string;
  /** Jaune bus : bouton Signaler, éléments actifs. */
  accent: string;
  /** Texte posé SUR l'accent (toujours foncé : le jaune est clair). */
  onAccent: string;
  /** Statuts des bus. */
  live: string;
  notCame: string;
  delay: string;
}

export const lightColors: ThemeColors = {
  background: palette.mist,
  card: palette.white,
  text: palette.nightBlue,
  textMuted: '#4A5868',
  border: '#DCE2E0',
  accent: palette.busYellow,
  onAccent: palette.nightBlue,
  live: '#0B7A5E',
  notCame: '#B42335',
  delay: '#B45309',
};

/** Mode sombre : statuts éclaircis pour rester lisibles sur fond foncé (contraste ≥ 4,5:1). */
export const darkColors: ThemeColors = {
  background: '#0B1522',
  card: '#14243A',
  text: palette.mist,
  textMuted: '#A9B6C4',
  border: '#24364F',
  accent: palette.busYellow,
  onAccent: palette.nightBlue,
  live: '#34C79A',
  notCame: '#F0707E',
  delay: '#F59E4B',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/**
 * Readex Pro gère le latin ET l'arabe. Sur Android, « fontWeight » ne marche
 * pas avec une police personnalisée : chaque graisse est une police à part.
 */
export const fonts = {
  regular: 'ReadexPro_400Regular',
  medium: 'ReadexPro_500Medium',
  semiBold: 'ReadexPro_600SemiBold',
  bold: 'ReadexPro_700Bold',
} as const;
export type FontWeight = keyof typeof fonts;

export const fontSizes = { caption: 13, body: 16, heading: 20, title: 28 } as const;
