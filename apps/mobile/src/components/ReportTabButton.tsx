import Ionicons from '@expo/vector-icons/Ionicons';
import {
  type AccessibilityState,
  Pressable,
  type PressableProps,
  StyleSheet,
  View,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

interface ReportTabButtonProps {
  onPress?: PressableProps['onPress'];
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
}

/**
 * Bouton central « Signaler » de la barre d'onglets : cercle jaune surélevé,
 * pour qu'un signalement soit toujours à un geste.
 */
export function ReportTabButton({
  onPress,
  accessibilityLabel,
  accessibilityState,
}: ReportTabButtonProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
        onPress={onPress}
        style={({ pressed }) => [
          styles.circle,
          { backgroundColor: colors.accent, borderColor: colors.card },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="megaphone" size={26} color={colors.onAccent} />
      </Pressable>
    </View>
  );
}

const SIZE = 60;

const styles = StyleSheet.create({
  wrapper: { flex: 1, alignItems: 'center' },
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 4,
    marginTop: -SIZE / 3,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  pressed: { transform: [{ scale: 0.95 }] },
});
