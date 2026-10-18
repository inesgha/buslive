import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

interface Choice<T> {
  value: T;
  label: string;
}

interface ChoiceChipsProps<T> {
  choices: Choice<T>[];
  /** Valeurs sélectionnées (une seule pour un choix exclusif). */
  selected: readonly T[];
  onPress: (value: T) => void;
  accessibilityLabel: string;
  /** checkbox : plusieurs choix possibles (jours) ; radio : un seul (ligne). */
  mode?: 'radio' | 'checkbox';
}

/** Puces à toucher, qui passent à la ligne quand la place manque. */
export function ChoiceChips<T extends string | number>({
  choices,
  selected,
  onPress,
  accessibilityLabel,
  mode = 'radio',
}: ChoiceChipsProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole={mode === 'radio' ? 'radiogroup' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={styles.container}
    >
      {choices.map((choice) => {
        const active = selected.includes(choice.value);
        return (
          <Pressable
            key={String(choice.value)}
            accessibilityRole={mode}
            accessibilityState={mode === 'radio' ? { selected: active } : { checked: active }}
            onPress={() => onPress(choice.value)}
            style={[
              styles.chip,
              { borderColor: active ? colors.accent : colors.border },
              active && { backgroundColor: colors.accent },
            ]}
          >
            <AppText weight={active ? 'semiBold' : 'regular'} color={active ? 'onAccent' : 'text'}>
              {choice.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
