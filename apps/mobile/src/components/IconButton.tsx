import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/tokens';

interface IconButtonProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  /** Lu par les lecteurs d'écran (l'icône seule ne dit rien). */
  accessibilityLabel: string;
  onPress: () => void;
  color?: keyof ThemeColors;
  selected?: boolean;
}

/** Bouton réduit à une icône (étoile des favoris, cloche des alertes…). */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  color = 'text',
  selected,
}: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={24} color={colors[color]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Zone tactile de 44 × 44 au minimum.
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
