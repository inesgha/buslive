import { StyleSheet, View } from 'react-native';

import { contrastRatio } from '@/theme/contrast';
import { fonts, palette, radius } from '@/theme/tokens';

import { AppText } from './AppText';

/**
 * Couleur du texte posé sur la couleur d'une ligne : blanc ou bleu nuit,
 * selon celui qui contraste le mieux (les couleurs viennent de la base).
 */
export function badgeTextColor(lineColor: string): string {
  return contrastRatio(palette.white, lineColor) >= contrastRatio(palette.nightBlue, lineColor)
    ? palette.white
    : palette.nightBlue;
}

interface LineBadgeProps {
  code: string;
  color: string;
  /** normal : listes de lignes ; small : listes compactes (passages, arrêts proches). */
  size?: 'normal' | 'small';
}

/** Pastille avec le numéro de la ligne, dans la couleur de la ligne. */
export function LineBadge({ code, color, size = 'normal' }: LineBadgeProps) {
  const small = size === 'small';
  return (
    <View style={[styles.badge, small && styles.badgeSmall, { backgroundColor: color }]}>
      <AppText
        style={[styles.code, small && styles.codeSmall, { color: badgeTextColor(color) }]}
        // Le numéro reste lisible tel quel, même dans une interface en arabe.
        accessibilityLabel={code}
      >
        {code}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSmall: { minWidth: 32, height: 28, paddingHorizontal: 6 },
  code: { fontFamily: fonts.bold, fontSize: 18, textAlign: 'center' },
  codeSmall: { fontSize: 14, lineHeight: 18 },
});
