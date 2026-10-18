import type { Alert, Locale } from '@buslive/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { formatAlertSummary } from '@/alerts/alertText';
import { localizedHeadsign, localizedName } from '@/i18n/localized';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Card } from './Card';
import { LineBadge } from './LineBadge';

interface AlertRowProps {
  alert: Alert;
  locale: Locale;
  onPress: () => void;
  onToggle: (enabled: boolean) => void;
}

/** Une alerte : ligne, sens, arrêt, jours et heures, avec son interrupteur. */
export function AlertRow({ alert, locale, onPress, onToggle }: AlertRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card style={[styles.card, !alert.enabled && styles.disabled]}>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.main}>
        <LineBadge code={alert.line.code} color={alert.line.color} size="small" />
        <View style={styles.text}>
          <AppText weight="semiBold" numberOfLines={1}>
            {localizedName(alert.stop, locale)}
          </AppText>
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {localizedHeadsign(alert.direction, locale)}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {formatAlertSummary(alert, t, locale)}
          </AppText>
          {alert.notifyApproach ? (
            <AppText variant="caption" color="textMuted">
              {t('alerts.lead', { minutes: alert.leadMinutes })}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      <Switch
        accessibilityLabel={t('alerts.toggle')}
        value={alert.enabled}
        onValueChange={onToggle}
        trackColor={{ true: colors.live, false: colors.border }}
        thumbColor={colors.card}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
  disabled: { opacity: 0.6 },
});
