import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { queryKeys } from '@/api/network';
import { fetchMyTrust } from '@/api/reports';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Card } from './Card';

const weightFormat = new Intl.NumberFormat('fr', { maximumFractionDigits: 1 });

/** Score de confiance de l'utilisateur connecté, son niveau et ses derniers points. */
export function TrustCard() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: queryKeys.myTrust, queryFn: fetchMyTrust });
  if (!data) return null;

  return (
    <Card style={styles.card}>
      <AppText variant="heading">{t('trust.title')}</AppText>
      <View style={styles.row}>
        <AppText weight="semiBold" style={styles.fill}>
          {t(`trust.levels.${data.level}`)}
        </AppText>
        <AppText color="textMuted">{t('trust.score', { score: data.score })}</AppText>
      </View>
      <AppText variant="caption" color="textMuted">
        {t('trust.weight', { weight: weightFormat.format(data.weight) })}
      </AppText>

      {data.events.length === 0 ? (
        <AppText variant="caption" color="textMuted">
          {t('trust.empty')}
        </AppText>
      ) : (
        <>
          <AppText variant="caption" weight="medium">
            {t('trust.history')}
          </AppText>
          {data.events.slice(0, 5).map((event) => (
            <View key={`${event.createdAt}-${event.reason}`} style={styles.row}>
              <AppText variant="caption" style={styles.fill}>
                {t(`trust.reasons.${event.reason}`)}
              </AppText>
              <AppText
                variant="caption"
                weight="semiBold"
                color={event.delta > 0 ? 'live' : 'notCame'}
              >
                {/* Signe explicite : « +10 » / « −15 ». */}
                {event.delta > 0 ? `+${event.delta}` : `−${Math.abs(event.delta)}`}
              </AppText>
            </View>
          ))}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fill: { flex: 1 },
});
