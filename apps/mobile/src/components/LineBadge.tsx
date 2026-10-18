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

/** Pastille avec le numéro de la ligne, dans la couleur de la ligne. */
export function LineBadge({ code, color }: { code: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <AppText
        style={[styles.code, { color: badgeTextColor(color) }]}
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
  code: { fontFamily: fonts.bold, fontSize: 18, textAlign: 'center' },
});
