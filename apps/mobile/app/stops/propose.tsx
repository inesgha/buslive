import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ApiError } from '@/api/errors';
import { fetchNearbyStops, queryKeys } from '@/api/network';
import { proposeStop } from '@/api/proposals';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChoiceChips } from '@/components/ChoiceChips';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useUserLocation } from '@/hooks/useUserLocation';
import {
  buildProposalInput,
  isCloseEnough,
  linesAround,
  type ProposalDraft,
} from '@/proposals/proposalForm';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Proposer un arrêt manquant à l'endroit choisi par un appui long sur la carte. */
export default function ProposeStopScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { state } = useAuth();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const point = { latitude: Number(params.lat), longitude: Number(params.lng) };
  const location = useUserLocation();
  const [draft, setDraft] = useState<ProposalDraft>({ nameFr: '', nameAr: '', lineIds: [] });
  const [error, setError] = useState<string | null>(null);

  const nearby = useQuery({
    queryKey: queryKeys.nearbyStops(point),
    queryFn: () => fetchNearbyStops(point, 1500),
    enabled: Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
  });
  const submit = useMutation({
    mutationFn: proposeStop,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.myStopProposals });
      router.back();
    },
    onError: (cause) =>
      setError(
        cause instanceof ApiError && cause.status === 409
          ? t('proposal.duplicate')
          : cause instanceof ApiError && cause.status === 400
            ? t('proposal.outOfArea')
            : t('proposal.error'),
      ),
  });

  if (state.status !== 'signedIn') {
    return (
      <Screen>
        <EmptyState
          icon="location-outline"
          title={t('proposal.signIn')}
          action={{ label: t('alerts.signIn'), onPress: () => router.replace('/auth/login') }}
        />
      </Screen>
    );
  }

  const userPosition = location.status === 'granted' ? location.position : null;
  const onSite = isCloseEnough(userPosition, point);
  const lines = linesAround(nearby.data ?? []);

  function onSubmit() {
    const input = buildProposalInput(
      draft,
      point,
      location.status === 'granted' ? location.accuracy : null,
    );
    if (!input) {
      setError(t('proposal.incomplete'));
      return;
    }
    setError(null);
    submit.mutate(input);
  }

  return (
    <Screen scroll>
      <AppText color="textMuted">{t('proposal.intro')}</AppText>
      {location.status === 'pending' ? (
        <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} />
      ) : !onSite ? (
        <Card>
          <AppText color="delay">{t('proposal.notOnSite')}</AppText>
        </Card>
      ) : null}

      <Card style={styles.section}>
        <TextField
          label={t('proposal.nameFr')}
          value={draft.nameFr}
          onChangeText={(nameFr) => setDraft({ ...draft, nameFr })}
          maxLength={80}
        />
        <TextField
          label={t('proposal.nameAr')}
          value={draft.nameAr}
          onChangeText={(nameAr) => setDraft({ ...draft, nameAr })}
          maxLength={80}
        />
        {lines.length > 0 ? (
          <>
            <AppText weight="medium">{t('proposal.lines')}</AppText>
            <ChoiceChips
              mode="checkbox"
              accessibilityLabel={t('proposal.lines')}
              choices={lines.map((line) => ({ value: line.id, label: line.code }))}
              selected={draft.lineIds}
              onPress={(id) =>
                setDraft({
                  ...draft,
                  lineIds: draft.lineIds.includes(id)
                    ? draft.lineIds.filter((lineId) => lineId !== id)
                    : [...draft.lineIds, id],
                })
              }
            />
          </>
        ) : null}
      </Card>

      {error ? <AppText color="notCame">{error}</AppText> : null}
      <Button
        label={t('proposal.submit')}
        loading={submit.isPending}
        disabled={!onSite}
        onPress={onSubmit}
      />
      <AppText variant="caption" color="textMuted">
        {t('proposal.moderationNote')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
});
