import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { IconButton } from './IconButton';

interface ValueStepperProps {
  label: string;
  /** Valeur déjà mise en forme (« 3,500 DT », « 07:30 », « 3 »). */
  value: string;
  onStep: (steps: number) => void;
}

/** Valeur réglable avec « − » et « + » (places, prix, heure). */
export function ValueStepper({ label, value, onStep }: ValueStepperProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <AppText style={styles.label}>{label}</AppText>
      <View style={[styles.stepper, { borderColor: colors.border }]}>
        <IconButton
          icon="remove"
          accessibilityLabel={t('rideForm.decrease', { label })}
          onPress={() => onStep(-1)}
        />
        <AppText weight="semiBold" style={styles.value} accessibilityLiveRegion="polite">
          {value}
        </AppText>
        <IconButton
          icon="add"
          accessibilityLabel={t('rideForm.increase', { label })}
          onPress={() => onStep(1)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md },
  // Chiffres et heures écrits de gauche à droite, même en arabe.
  value: { minWidth: 84, textAlign: 'center', writingDirection: 'ltr' },
});
