import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { queryKeys } from '@/api/network';
import { fetchLineStats } from '@/api/reports';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Card } from './Card';

const percent = new Intl.NumberFormat('fr', { style: 'percent', maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('fr', { maximumFractionDigits: 1 });

/**
 * Statistiques d'une ligne (30 jours). Sans assez de passages observés, on
 * l'explique au lieu d'afficher un pourcentage trompeur.
 */
export function StatsCard({ lineId }: { lineId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: queryKeys.lineStats(lineId),
    queryFn: () => fetchLineStats(lineId),
  });
  if (!data) return null;

  return (
    <Card style={styles.card}>
      <AppText variant="heading">{t('stats.title')}</AppText>
      {data.enoughData && data.onTimeRate !== null && data.averageDelayMinutes !== null ? (
        <View style={styles.row}>
          <Stat label={t('stats.onTime')} value={percent.format(data.onTimeRate)} />
          <Stat
            label={t('stats.averageDelay')}
            value={t('stats.minutes', { value: decimal.format(data.averageDelayMinutes) })}
          />
          <Stat label={t('stats.notCame')} value={String(data.notCameConfirmed)} />
        </View>
      ) : (
        <AppText color="textMuted">{t('stats.notEnough')}</AppText>
      )}
      <AppText variant="caption" color="textMuted">
        {t('stats.observed', { count: data.observedPassages })}
      </AppText>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  stat: { flex: 1 },
});
