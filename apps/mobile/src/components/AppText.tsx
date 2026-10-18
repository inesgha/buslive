import { StyleSheet, Text, type TextProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSizes, type FontWeight, type ThemeColors } from '@/theme/tokens';

type Variant = keyof typeof fontSizes;

const DEFAULT_WEIGHT: Record<Variant, FontWeight> = {
  caption: 'regular',
  body: 'regular',
  heading: 'semiBold',
  title: 'bold',
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  weight?: FontWeight;
  /** Nom d'une couleur du thème (pas de couleur en dur). */
  color?: keyof ThemeColors;
}

/**
 * Texte de l'app : applique la police Readex Pro, la taille et la couleur du thème.
 * À utiliser à la place de <Text> partout.
 */
export function AppText({
  variant = 'body',
  weight,
  color = 'text',
  style,
  ...props
}: AppTextProps) {
  const { colors } = useTheme();
  return (
    <Text
      {...props}
      style={[
        styles.base,
        {
          fontFamily: fonts[weight ?? DEFAULT_WEIGHT[variant]],
          fontSize: fontSizes[variant],
          lineHeight: Math.round(fontSizes[variant] * 1.4),
          color: colors[color],
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  // « left » est automatiquement inversé en « right » quand l'interface est en RTL.
  base: { textAlign: 'left' },
});
