import type { LiveArrival, Locale } from '@buslive/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { localizedHeadsign } from '@/i18n/localized';
import { formatEta } from '@/time/format';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { LineBadge } from './LineBadge';

/** Arrivée EN DIRECT d'un bus (position partagée par des passagers), en vert. */
export function LiveArrivalRow({ arrival, locale }: { arrival: LiveArrival; locale: Locale }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <LineBadge code={arrival.line.code} color={arrival.line.color} size="small" />
      <AppText style={styles.headsign} numberOfLines={1}>
        {localizedHeadsign(arrival.direction, locale)}
      </AppText>
      <View style={[styles.dot, { backgroundColor: colors.live }]} />
      <AppText weight="semiBold" color="live">
        {t('live.eta', { eta: formatEta(arrival.etaMinutes, t) })}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  headsign: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
