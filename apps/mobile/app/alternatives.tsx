import type { GeoPoint } from '@buslive/shared';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { fetchLocalities, fetchMyRides, fetchNearbyLouage, searchRides } from '@/api/alternatives';
import { queryKeys } from '@/api/network';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { LocalityChips } from '@/components/LocalityChips';
import { LouageStationCard } from '@/components/LouageStationCard';
import { OfflineBanner } from '@/components/OfflineBanner';
import { RideRow } from '@/components/RideRow';
import { Screen } from '@/components/Screen';
import { useServiceClock } from '@/hooks/useServiceClock';
import { useUserLocation } from '@/hooks/useUserLocation';
import { currentLocale } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Centre par défaut (Mahdia) si la position n'est pas disponible. */
const MAHDIA: GeoPoint = { latitude: 35.5047, longitude: 11.0622 };

/**
 * Alternatives au bus : louages proches (données de référence, hors ligne)
 * et covoiturage entre utilisateurs (connecté). Paramètre « toCode » : code de
 * la localité proposée comme destination (ex. le terminus de la ligne perturbée).
 */
export default function AlternativesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const locale = currentLocale();
  const clock = useServiceClock();
  const { state } = useAuth();
  const signedIn = state.status === 'signedIn';
  const params = useLocalSearchParams<{ toCode?: string }>();
  // null = pas encore choisi : la destination proposée (toCode) s'applique.
  const [destinationChoice, setDestinationChoice] = useState<{ id?: string } | null>(null);
  const [chosenFromId, setChosenFromId] = useState<string | undefined>();

  const location = useUserLocation();
  const center = (location.status === 'granted' ? location.position : null) ?? MAHDIA;

  const localities = useQuery({ queryKey: queryKeys.localities, queryFn: fetchLocalities });
  const destinationId = destinationChoice
    ? destinationChoice.id
    : localities.data?.find((locality) => locality.code === params.toCode)?.id;
  const louage = useQuery({
    queryKey: queryKeys.louageNearby(center, destinationId),
    queryFn: () => fetchNearbyLouage(center, destinationId),
    enabled: location.status !== 'pending',
  });
  // Départ DÉDUIT : la localité de la station de louage la plus proche, sauf choix explicite.
  const fromId = chosenFromId ?? louage.data?.[0]?.locality?.id;
  const rides = useQuery({
    queryKey: queryKeys.rides(fromId, destinationId),
    queryFn: () => searchRides(fromId, destinationId),
    enabled: signedIn,
  });
  const mine = useQuery({ queryKey: queryKeys.myRides, queryFn: fetchMyRides, enabled: signedIn });
  const myCount = (mine.data?.offers.length ?? 0) + (mine.data?.requested.length ?? 0);

  return (
    <Screen scroll>
      <OfflineBanner />
      <AppText color="textMuted">{t('alternatives.intro')}</AppText>

      <Card style={styles.section}>
        <AppText weight="medium">{t('alternatives.destination')}</AppText>
        {localities.data ? (
          <LocalityChips
            accessibilityLabel={t('alternatives.destination')}
            localities={localities.data}
            selected={destinationId}
            onSelect={(id) => setDestinationChoice({ id })}
            locale={locale}
            anyLabel={t('alternatives.anyDestination')}
          />
        ) : (
          <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} />
        )}
      </Card>

      <AppText variant="heading">{t('alternatives.louageTitle')}</AppText>
      {louage.isPending ? (
        <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} />
      ) : louage.error && !louage.data ? (
        <AppText color="notCame">{t('alternatives.louageError')}</AppText>
      ) : louage.data?.length === 0 ? (
        <AppText color="textMuted">{t('alternatives.louageNone')}</AppText>
      ) : (
        louage.data?.map((station) => (
          <LouageStationCard
            key={station.id}
            station={station}
            locale={locale}
            clock={clock}
            destinationId={destinationId}
          />
        ))
      )}
      <AppText variant="caption" color="textMuted">
        {t('alternatives.priceNote')}
      </AppText>

      <AppText variant="heading">{t('alternatives.ridesTitle')}</AppText>
      {!signedIn ? (
        <Card style={styles.section}>
          <AppText color="textMuted">{t('alternatives.ridesSignIn')}</AppText>
          <Button label={t('alerts.signIn')} onPress={() => router.push('/auth/login')} />
        </Card>
      ) : (
        <>
          {localities.data ? (
            <Card style={styles.section}>
              <AppText weight="medium">{t('rideForm.from')}</AppText>
              <LocalityChips
                accessibilityLabel={t('rideForm.from')}
                localities={localities.data}
                selected={fromId}
                onSelect={setChosenFromId}
                locale={locale}
                anyLabel={t('alternatives.anyDestination')}
              />
            </Card>
          ) : null}
          {rides.isPending ? (
            <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} />
          ) : rides.data?.length ? (
            rides.data.map((ride) => (
              <RideRow
                key={ride.id}
                ride={ride}
                locale={locale}
                clock={clock}
                onPress={() => router.push({ pathname: '/rides/[id]', params: { id: ride.id } })}
              />
            ))
          ) : (
            <AppText color="textMuted">{t('alternatives.ridesNone')}</AppText>
          )}
          <Button
            label={t('alternatives.offerRide')}
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/rides/new',
                params: { from: fromId ?? '', to: destinationId ?? '' },
              })
            }
          />
          {myCount > 0 ? (
            <Card style={styles.section}>
              <AppText variant="heading">{t('alternatives.myRides')}</AppText>
              {[...(mine.data?.offers ?? []), ...(mine.data?.requested ?? [])].map((ride) => (
                <RideRow
                  key={ride.id}
                  ride={ride}
                  locale={locale}
                  clock={clock}
                  onPress={() => router.push({ pathname: '/rides/[id]', params: { id: ride.id } })}
                />
              ))}
            </Card>
          ) : null}
          <AppText variant="caption" color="textMuted">
            {t('rides.safety')}
          </AppText>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
});
