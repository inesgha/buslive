import { formatMillimes, RIDE_RULES } from '@buslive/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { createRide, fetchLocalities } from '@/api/alternatives';
import { queryKeys } from '@/api/network';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChoiceChips } from '@/components/ChoiceChips';
import { EmptyState } from '@/components/EmptyState';
import { LocalityChips } from '@/components/LocalityChips';
import { Screen } from '@/components/Screen';
import { ValueStepper } from '@/components/ValueStepper';
import { useServiceClock } from '@/hooks/useServiceClock';
import { rideErrorMessage } from '@/rides/rideErrors';
import { currentLocale } from '@/i18n';
import {
  buildRideInput,
  defaultRideDraft,
  type RideDraft,
  rideDays,
  shiftDeparture,
  shiftPrice,
} from '@/rides/rideForm';
import { formatWindowTime } from '@/alerts/alertForm';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** « Proposer un trajet » de covoiturage. Paramètres facultatifs : « from », « to » (localités). */
export default function NewRideScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const locale = currentLocale();
  const clock = useServiceClock();
  const queryClient = useQueryClient();
  const { state } = useAuth();
  const params = useLocalSearchParams<{ from?: string; to?: string }>();
  const [draft, setDraft] = useState<RideDraft>(() => ({
    ...defaultRideDraft(clock),
    fromLocalityId: params.from || undefined,
    toLocalityId: params.to || undefined,
  }));
  const [error, setError] = useState<string | null>(null);
  const localities = useQuery({ queryKey: queryKeys.localities, queryFn: fetchLocalities });

  const publish = useMutation({
    mutationFn: createRide,
    onSuccess: (ride) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.myRides });
      void queryClient.invalidateQueries({ queryKey: ['rides'] });
      router.replace({ pathname: '/rides/[id]', params: { id: ride.id } });
    },
    onError: (cause) => setError(rideErrorMessage(cause, t, locale)),
  });

  const title = <Stack.Screen options={{ title: t('rideForm.title') }} />;
  if (state.status !== 'signedIn') {
    return (
      <Screen>
        {title}
        <EmptyState
          icon="car-outline"
          title={t('alternatives.ridesSignIn')}
          action={{ label: t('alerts.signIn'), onPress: () => router.replace('/auth/login') }}
        />
      </Screen>
    );
  }

  const days = rideDays(clock).map(({ offset, isoDate }) => {
    const [, month, day] = isoDate.split('-');
    return {
      value: offset,
      label:
        offset === 0
          ? t('rideForm.today')
          : offset === 1
            ? t('rideForm.tomorrow')
            : `${day}/${month}`,
    };
  });

  function onPublish() {
    const input = buildRideInput(draft, clock);
    if (!input) {
      setError(t('rideForm.incomplete'));
      return;
    }
    setError(null);
    publish.mutate(input);
  }

  return (
    <Screen scroll>
      {title}
      {state.user.phone ? null : (
        <Card>
          <AppText color="delay">{t('rides.phoneRequired')}</AppText>
        </Card>
      )}
      {localities.data ? (
        <Card style={styles.section}>
          <AppText weight="medium">{t('rideForm.from')}</AppText>
          <LocalityChips
            accessibilityLabel={t('rideForm.from')}
            localities={localities.data}
            selected={draft.fromLocalityId}
            onSelect={(fromLocalityId) => setDraft({ ...draft, fromLocalityId })}
            locale={locale}
          />
          <AppText weight="medium">{t('rideForm.to')}</AppText>
          <LocalityChips
            accessibilityLabel={t('rideForm.to')}
            localities={localities.data}
            selected={draft.toLocalityId}
            onSelect={(toLocalityId) => setDraft({ ...draft, toLocalityId })}
            locale={locale}
          />
        </Card>
      ) : (
        <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} />
      )}

      <Card style={styles.section}>
        <AppText weight="medium">{t('rideForm.day')}</AppText>
        <ChoiceChips
          accessibilityLabel={t('rideForm.day')}
          choices={days}
          selected={[draft.dayOffset]}
          onPress={(dayOffset) => setDraft({ ...draft, dayOffset })}
        />
        <ValueStepper
          label={t('rideForm.time')}
          value={formatWindowTime(draft.departureMinutes)}
          onStep={(steps) => setDraft(shiftDeparture(draft, steps))}
        />
        <ValueStepper
          label={t('rideForm.seats')}
          value={String(draft.seats)}
          onStep={(steps) =>
            setDraft({
              ...draft,
              seats: Math.min(RIDE_RULES.maxSeats, Math.max(1, draft.seats + steps)),
            })
          }
        />
        <ValueStepper
          label={t('rideForm.price')}
          value={formatMillimes(draft.priceMillimes, locale)}
          onStep={(steps) => setDraft(shiftPrice(draft, steps))}
        />
        <AppText variant="caption" color="textMuted">
          {t('rideForm.priceHint')}
        </AppText>
      </Card>

      {error ? <AppText color="notCame">{error}</AppText> : null}
      <Button label={t('rideForm.publish')} loading={publish.isPending} onPress={onPublish} />
      <AppText variant="caption" color="textMuted">
        {t('rides.safety')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
});
