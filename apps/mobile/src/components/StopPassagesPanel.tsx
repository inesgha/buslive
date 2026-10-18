import { minutesUntil, type NearbyStop } from '@buslive/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { fetchStopDepartures, queryKeys } from '@/api/network';
import { useServiceClock } from '@/hooks/useServiceClock';
import { currentLocale } from '@/i18n';
import { localizedName } from '@/i18n/localized';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { PassageRow } from './PassageRow';

/** Nombre de passages affichés dans le panneau. */
const VISIBLE_PASSAGES = 6;

/** Panneau d'un arrêt sélectionné sur la carte : ses prochains passages. */
export function StopPassagesPanel({ stop, onClose }: { stop: NearbyStop; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const locale = currentLocale();
  const clock = useServiceClock();
  const { data, error, isPending } = useQuery({
    queryKey: queryKeys.stopDepartures(stop.id),
    queryFn: () => fetchStopDepartures(stop.id),
    // Les passages changent avec l'heure : on recharge toutes les minutes si l'écran reste ouvert.
    refetchInterval: 60_000,
  });

  // Les données peuvent venir du cache (hors ligne) : on retire les passages déjà passés.
  const upcoming = (data?.passages ?? [])
    .filter((passage) => minutesUntil(passage, clock) >= 0)
    .slice(0, VISIBLE_PASSAGES);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.title}>
          <AppText variant="heading" numberOfLines={1}>
            {localizedName(stop, locale)}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {t('stop.nextDepartures')}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('stop.close')}
          onPress={onClose}
          hitSlop={12}
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>

      {isPending && !data ? (
        <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} />
      ) : error && !data ? (
        <AppText color="notCame">{t('stop.departuresError')}</AppText>
      ) : upcoming.length === 0 ? (
        <AppText color="textMuted">{t('stop.noDepartures')}</AppText>
      ) : (
        upcoming.map((passage) => (
          <PassageRow
            key={`${passage.direction.id}-${passage.serviceDate}-${passage.passingMinutes}`}
            passage={passage}
            clock={clock}
            locale={locale}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { flex: 1 },
});
