import { minutesToTime, tunisClock } from '@buslive/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share, StyleSheet, View } from 'react-native';

import { createTripShare, fetchMyTripShares, revokeTripShare } from '@/api/alternatives';
import { fetchLine, queryKeys } from '@/api/network';
import { currentLocale } from '@/i18n';
import { localizedHeadsign, localizedName } from '@/i18n/localized';
import type { SharingState } from '@/live/sharingStore';
import { tripShareUrl } from '@/trips/tripShare';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import { ChoiceChips } from './ChoiceChips';

/**
 * « Partager mon trajet » : pendant le partage de position, envoyer à un proche
 * un lien de suivi en direct (page web, sans l'app). Le lien ne montre ni nom
 * ni téléphone, et expire à la fin du partage.
 */
export function TripShareCard({ sharing }: { sharing: SharingState }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const queryClient = useQueryClient();
  const [chosenStopId, setChosenStopId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const line = useQuery({
    queryKey: queryKeys.line(sharing.lineId),
    queryFn: () => fetchLine(sharing.lineId),
  });
  const shares = useQuery({ queryKey: queryKeys.tripShares, queryFn: fetchMyTripShares });
  const direction = line.data?.directions.find((d) => d.id === sharing.directionId);
  const stops = direction?.stops ?? [];
  // Arrêt de descente DÉDUIT : le terminus, sauf choix explicite.
  const stopId = chosenStopId ?? stops.at(-1)?.stop.id;
  const mine = (shares.data ?? []).filter((share) => share.sessionId === sharing.sessionId);

  const create = useMutation({
    mutationFn: (destinationStopId: string) =>
      createTripShare(sharing.sessionId, destinationStopId),
    onSuccess: async (share) => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripShares });
      await Share.share({
        message: t('tripShare.message', {
          line: sharing.lineCode,
          headsign: localizedHeadsign(sharing, locale),
          stop: localizedName(share.destination, locale),
          url: tripShareUrl(share.path),
        }),
      });
    },
    onError: () => setError(t('tripShare.error')),
  });
  const revoke = useMutation({
    mutationFn: revokeTripShare,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.tripShares }),
  });

  return (
    <Card style={styles.card}>
      <AppText variant="heading">{t('tripShare.title')}</AppText>
      <AppText color="textMuted">{t('tripShare.intro')}</AppText>
      {stops.length > 0 ? (
        <>
          <AppText weight="medium">{t('tripShare.destination')}</AppText>
          <ChoiceChips
            accessibilityLabel={t('tripShare.destination')}
            choices={stops.map(({ stop }) => ({
              value: stop.id,
              label: localizedName(stop, locale),
            }))}
            selected={stopId ? [stopId] : []}
            onPress={setChosenStopId}
          />
        </>
      ) : null}
      <Button
        label={t('tripShare.share')}
        loading={create.isPending}
        disabled={!stopId}
        onPress={() => stopId && create.mutate(stopId)}
      />
      {error ? <AppText color="notCame">{error}</AppText> : null}
      {__DEV__ ? (
        <AppText variant="caption" color="textMuted">
          {t('tripShare.devNote')}
        </AppText>
      ) : null}

      {mine.length > 0 ? (
        <>
          <AppText weight="medium">{t('tripShare.active')}</AppText>
          {mine.map((share) => (
            <View key={share.id} style={styles.row}>
              <AppText variant="caption" style={styles.fill}>
                {t('tripShare.linkTo', {
                  stop: localizedName(share.destination, locale),
                  time: minutesToTime(tunisClock(new Date(share.expiresAt)).minutes),
                })}
              </AppText>
              <Button
                label={t('tripShare.revoke')}
                variant="secondary"
                onPress={() => revoke.mutate(share.id)}
              />
            </View>
          ))}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fill: { flex: 1 },
});
