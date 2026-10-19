import {
  formatMillimes,
  isRideOpen,
  RIDE_FLAG_REASONS,
  RIDE_RULES,
  type RideOfferDetail,
} from '@buslive/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from 'react-native';

import {
  cancelRide,
  cancelRideRequest,
  fetchRide,
  flagRide,
  requestRide,
  respondRideRequest,
} from '@/api/alternatives';
import { queryKeys } from '@/api/network';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ValueStepper } from '@/components/ValueStepper';
import { useNow } from '@/hooks/useNow';
import { useServiceClock } from '@/hooks/useServiceClock';
import { currentLocale } from '@/i18n';
import { localizedName } from '@/i18n/localized';
import { rideErrorMessage } from '@/rides/rideErrors';
import { formatDeparture } from '@/time/format';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Détail d'un trajet de covoiturage : demander des places, ou gérer les demandes. */
export default function RideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const ride = useQuery({ queryKey: queryKeys.ride(id), queryFn: () => fetchRide(id) });

  return (
    <>
      <Stack.Screen options={{ title: t('rides.title') }} />
      {ride.isPending ? (
        <ActivityIndicator style={styles.fill} color={colors.text} />
      ) : ride.data ? (
        <RideContent ride={ride.data} />
      ) : (
        <EmptyState icon="car-outline" title={t('rides.notFound')} />
      )}
    </>
  );
}

function RideContent({ ride }: { ride: RideOfferDetail }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const clock = useServiceClock();
  const now = useNow();
  const queryClient = useQueryClient();
  const [seats, setSeats] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const open = isRideOpen(ride, new Date(now));

  // Toute action renvoie le trajet à jour : on le met en cache, et les listes se rechargent.
  const act = useMutation({
    mutationFn: (action: () => Promise<RideOfferDetail>) => action(),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.ride(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.myRides });
      void queryClient.invalidateQueries({ queryKey: ['rides'] });
      setMessage(null);
    },
    onError: (error) => setMessage(rideErrorMessage(error, t, locale)),
  });

  const trip =
    locale === 'ar'
      ? `${localizedName(ride.from, locale)} – ${localizedName(ride.to, locale)}`
      : `${localizedName(ride.from, locale)} → ${localizedName(ride.to, locale)}`;

  function confirmCancel() {
    Alert.alert(t('rides.cancelConfirmTitle'), t('rides.cancelConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('rides.confirm'),
        style: 'destructive',
        onPress: () => act.mutate(() => cancelRide(ride.id)),
      },
    ]);
  }

  function chooseFlag() {
    Alert.alert(t('rides.flagTitle'), undefined, [
      ...RIDE_FLAG_REASONS.map((reason) => ({
        text: t(`rides.flagReasons.${reason}`),
        onPress: () =>
          void flagRide(ride.id, reason)
            .then(() => setMessage(t('rides.flagged')))
            .catch(() => setMessage(t('rides.error'))),
      })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  }

  return (
    <Screen scroll>
      <Card style={styles.section}>
        <AppText variant="heading">{trip}</AppText>
        <AppText>{formatDeparture(ride.departureAt, clock, t)}</AppText>
        <AppText color="textMuted">
          {t('rides.price', { price: formatMillimes(ride.priceMillimes, locale) })} ·{' '}
          {t('rides.seatsLeft', { count: ride.seatsLeft })}
        </AppText>
        <AppText color="textMuted">
          {t('rides.driver', { name: ride.driver.displayName })} ·{' '}
          {t(`trust.levels.${ride.driver.trustLevel}`)}
        </AppText>
        {ride.status === 'CANCELLED' ? (
          <AppText weight="semiBold" color="notCame">
            {t('rides.cancelled')}
          </AppText>
        ) : !open ? (
          <AppText color="textMuted">{t('rides.past')}</AppText>
        ) : null}
      </Card>

      {ride.mine ? (
        <Card style={styles.section}>
          <AppText variant="heading">{t('rides.requests')}</AppText>
          {ride.requests.length === 0 ? (
            <AppText color="textMuted">{t('rides.noRequests')}</AppText>
          ) : (
            ride.requests.map((request) => (
              <View key={request.id} style={styles.request}>
                <View style={styles.row}>
                  <AppText style={styles.fill}>
                    {t('rides.requestLine', {
                      name: request.passenger.displayName,
                      count: request.seats,
                    })}
                  </AppText>
                  <AppText
                    variant="caption"
                    color={request.status === 'ACCEPTED' ? 'live' : 'textMuted'}
                  >
                    {t(`rides.requestStatus.${request.status}`)}
                  </AppText>
                </View>
                {request.passengerPhone ? <PhoneButton phone={request.passengerPhone} /> : null}
                {request.status === 'PENDING' && open ? (
                  <View style={styles.row}>
                    <View style={styles.fill}>
                      <Button
                        label={t('rides.accept')}
                        onPress={() =>
                          act.mutate(() => respondRideRequest(ride.id, request.id, true))
                        }
                      />
                    </View>
                    <View style={styles.fill}>
                      <Button
                        label={t('rides.decline')}
                        variant="secondary"
                        onPress={() =>
                          act.mutate(() => respondRideRequest(ride.id, request.id, false))
                        }
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ))
          )}
          {ride.status === 'ACTIVE' ? (
            <Button label={t('rides.cancelRide')} variant="danger" onPress={confirmCancel} />
          ) : null}
        </Card>
      ) : (
        <Card style={styles.section}>
          {ride.myRequest && ride.myRequest.status !== 'CANCELLED' ? (
            <>
              <AppText color={ride.myRequest.status === 'ACCEPTED' ? 'live' : 'text'}>
                {t(`rides.myRequest.${ride.myRequest.status}`)}
              </AppText>
              {ride.myRequest.driverPhone ? (
                <PhoneButton phone={ride.myRequest.driverPhone} />
              ) : null}
              {open && ride.myRequest.status !== 'DECLINED' ? (
                <Button
                  label={t('rides.cancelRequest')}
                  variant="secondary"
                  loading={act.isPending}
                  onPress={() => act.mutate(() => cancelRideRequest(ride.id))}
                />
              ) : null}
            </>
          ) : open && ride.seatsLeft > 0 ? (
            <>
              <ValueStepper
                label={t('rides.seatsLabel')}
                value={String(seats)}
                onStep={(steps) =>
                  setSeats(
                    Math.min(
                      Math.min(ride.seatsLeft, RIDE_RULES.maxSeats),
                      Math.max(1, seats + steps),
                    ),
                  )
                }
              />
              <Button
                label={t('rides.request')}
                loading={act.isPending}
                onPress={() => act.mutate(() => requestRide(ride.id, seats))}
              />
            </>
          ) : null}
          <Button label={t('rides.flag')} variant="secondary" onPress={chooseFlag} />
        </Card>
      )}

      {message ? <AppText color="textMuted">{message}</AppText> : null}
      <AppText variant="caption" color="textMuted">
        {t('rides.safety')}
      </AppText>
    </Screen>
  );
}

/** Numéro (visible seulement après acceptation) et bouton pour appeler. */
function PhoneButton({ phone }: { phone: string }) {
  const { t } = useTranslation();
  return (
    <Button
      label={t('rides.call', { phone })}
      variant="secondary"
      onPress={() => void Linking.openURL(`tel:${phone}`)}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  section: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  request: { gap: spacing.sm, paddingVertical: spacing.xs },
});
