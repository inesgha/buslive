import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { formatWindowTime } from '@/alerts/alertForm';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { IconButton } from './IconButton';

interface TimeStepperProps {
  label: string;
  minutes: number;
  onStep: (steps: number) => void;
}

/**
 * Heure réglable par quart d'heure avec « − » et « + ». Plus simple et plus
 * lisible qu'une roue de sélection, et sans dépendance native supplémentaire.
 */
export function TimeStepper({ label, minutes, onStep }: TimeStepperProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <AppText style={styles.label}>{label}</AppText>
      <View style={[styles.stepper, { borderColor: colors.border }]}>
        <IconButton
          icon="remove"
          accessibilityLabel={t('alertForm.earlier', { label })}
          onPress={() => onStep(-1)}
        />
        {/* Les heures restent écrites de gauche à droite, même en arabe. */}
        <AppText weight="semiBold" style={styles.time} accessibilityLiveRegion="polite">
          {formatWindowTime(minutes)}
        </AppText>
        <IconButton
          icon="add"
          accessibilityLabel={t('alertForm.later', { label })}
          onPress={() => onStep(1)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { flex: 1 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
  },
  time: { minWidth: 64, textAlign: 'center', writingDirection: 'ltr' },
});
