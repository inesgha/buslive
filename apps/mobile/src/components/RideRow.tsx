import { formatMillimes, type Locale, type RideOffer, type ServiceClock } from '@buslive/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { localizedName } from '@/i18n/localized';
import { formatDeparture } from '@/time/format';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Card } from './Card';

interface RideRowProps {
  ride: RideOffer;
  locale: Locale;
  clock: ServiceClock;
  onPress: () => void;
}

/** Un trajet de covoiturage : trajet, départ, places libres, participation, conducteur. */
export function RideRow({ ride, locale, clock, onPress }: RideRowProps) {
  const { t } = useTranslation();
  const trip =
    locale === 'ar'
      ? `${localizedName(ride.from, locale)} – ${localizedName(ride.to, locale)}`
      : `${localizedName(ride.from, locale)} → ${localizedName(ride.to, locale)}`;

  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <AppText weight="semiBold" style={styles.fill}>
            {trip}
          </AppText>
          <AppText variant="caption" weight="semiBold">
            {t('rides.price', { price: formatMillimes(ride.priceMillimes, locale) })}
          </AppText>
        </View>
        <AppText variant="caption" color="textMuted">
          {formatDeparture(ride.departureAt, clock, t)} ·{' '}
          {t('rides.seatsLeft', { count: ride.seatsLeft })}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {t('rides.driver', { name: ride.driver.displayName })} ·{' '}
          {t(`trust.levels.${ride.driver.trustLevel}`)}
        </AppText>
        {ride.myRequest ? (
          <AppText variant="caption" color={ride.myRequest.status === 'ACCEPTED' ? 'live' : 'text'}>
            {t(`rides.myRequest.${ride.myRequest.status}`)}
          </AppText>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fill: { flex: 1 },
});
