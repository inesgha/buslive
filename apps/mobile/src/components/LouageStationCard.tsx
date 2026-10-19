import {
  formatMillimes,
  isStationOpen,
  type Locale,
  minutesToTime,
  type NearbyLouageStation,
  type ServiceClock,
} from '@buslive/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { localizedName } from '@/i18n/localized';
import { formatDistance } from '@/time/format';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Card } from './Card';

interface LouageStationCardProps {
  station: NearbyLouageStation;
  locale: Locale;
  clock: ServiceClock;
  /** Destination choisie : seule cette route est montrée (sinon toutes). */
  destinationId?: string;
}

/** Une station de louage : distance, horaires, destinations et prix habituels. */
export function LouageStationCard({
  station,
  locale,
  clock,
  destinationId,
}: LouageStationCardProps) {
  const { t } = useTranslation();
  const open = isStationOpen(station, clock);
  const routes = destinationId
    ? station.routes.filter((route) => route.destination.id === destinationId)
    : station.routes;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <AppText weight="semiBold" style={styles.fill}>
          {localizedName(station, locale)}
        </AppText>
        {open === null ? null : (
          <AppText variant="caption" weight="semiBold" color={open ? 'live' : 'notCame'}>
            {open ? t('alternatives.open') : t('alternatives.closed')}
          </AppText>
        )}
      </View>
      <AppText variant="caption" color="textMuted">
        {formatDistance(station.distanceMeters, t)}
        {station.openingMinutes !== null && station.closingMinutes !== null
          ? ` · ${t('alternatives.hours', {
              from: minutesToTime(station.openingMinutes),
              to: minutesToTime(station.closingMinutes),
            })}`
          : ''}
      </AppText>
      {routes.map((route) => (
        <View key={route.id} style={styles.route}>
          <AppText style={styles.fill}>{localizedName(route.destination, locale)}</AppText>
          <AppText variant="caption" weight="medium">
            {t('alternatives.route', {
              price: formatMillimes(route.priceMillimes, locale),
              minutes: route.durationMinutes,
            })}
          </AppText>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  route: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  fill: { flex: 1 },
});
