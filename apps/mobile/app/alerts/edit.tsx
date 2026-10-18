import { ALERT_RULES, type Alert as AlertDto, type AlertInput } from '@buslive/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import {
  type AlertDraft,
  buildAlertInput,
  defaultAlertDraft,
  draftFromAlert,
  shiftTime,
  toggleDay,
} from '@/alerts/alertForm';
import { WEEKDAY_KEYS } from '@/alerts/alertText';
import { ApiError } from '@/api/errors';
import { createAlert, deleteAlert, fetchAlerts, updateAlert } from '@/api/me';
import { fetchNearbyStops, fetchStop, queryKeys } from '@/api/network';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChoiceChips } from '@/components/ChoiceChips';
import { EmptyState } from '@/components/EmptyState';
import { LineBadge } from '@/components/LineBadge';
import { NearbyStopRow } from '@/components/NearbyStopRow';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TimeStepper } from '@/components/TimeStepper';
import { ToggleRow } from '@/components/ToggleRow';
import { useFavorites } from '@/favorites/useFavorites';
import { useServiceClock } from '@/hooks/useServiceClock';
import { useUserLocation } from '@/hooks/useUserLocation';
import { currentLocale } from '@/i18n';
import { localizedHeadsign, localizedName } from '@/i18n/localized';
import { usePush } from '@/notifications/PushProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/**
 * Création ou modification d'une alerte « mon trajet ».
 * Paramètres : « id » (modifier une alerte) ou « stopId » (depuis un arrêt).
 */
export default function AlertEditScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id, stopId } = useLocalSearchParams<{ id?: string; stopId?: string }>();
  const { state } = useAuth();
  const alerts = useQuery({
    queryKey: queryKeys.alerts,
    queryFn: fetchAlerts,
    enabled: state.status === 'signedIn' && Boolean(id),
  });
  const existing = id ? alerts.data?.find((alert) => alert.id === id) : undefined;

  const title = (
    <Stack.Screen options={{ title: id ? t('alertForm.editTitle') : t('alertForm.createTitle') }} />
  );
  if (state.status !== 'signedIn') {
    return (
      <Screen>
        {title}
        <EmptyState
          icon="notifications-outline"
          title={t('alerts.signedOutTitle')}
          message={t('alerts.signedOutMessage')}
          action={{ label: t('alerts.signIn'), onPress: () => router.replace('/auth/login') }}
        />
      </Screen>
    );
  }
  if (id && alerts.isPending) {
    return (
      <Screen>
        {title}
        <ActivityIndicator style={styles.fill} color={colors.text} />
      </Screen>
    );
  }
  if (id && !existing) {
    return (
      <Screen>
        {title}
        <EmptyState icon="alert-circle-outline" title={t('alertForm.notFound')} />
      </Screen>
    );
  }
  return (
    <>
      {title}
      <AlertForm key={existing?.id ?? 'new'} existing={existing} initialStopId={stopId} />
    </>
  );
}

function AlertForm({ existing, initialStopId }: { existing?: AlertDto; initialStopId?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const locale = currentLocale();
  const clock = useServiceClock();
  const queryClient = useQueryClient();
  const { support, permission, requestPermission } = usePush();
  const [stopId, setStopId] = useState(existing?.stop.id ?? initialStopId);
  const [draft, setDraft] = useState<AlertDraft>(() =>
    existing ? draftFromAlert(existing) : defaultAlertDraft(clock),
  );
  const [error, setError] = useState<string | null>(null);

  const stop = useQuery({
    queryKey: queryKeys.stop(stopId ?? ''),
    queryFn: () => fetchStop(stopId ?? ''),
    enabled: Boolean(stopId),
  });

  // Une ligne et un sens par puce (« 10 · vers Ksour Essef »).
  const choices = (stop.data?.lines ?? []).flatMap((line) =>
    line.directions.map((direction) => ({
      value: `${line.id}:${direction.id}`,
      label: `${line.code} · ${localizedHeadsign(direction, locale)}`,
    })),
  );
  // Valeur DÉDUITE : un seul choix possible → il est pris d'office.
  const selectedKey = draft.lineId
    ? `${draft.lineId}:${draft.directionId}`
    : choices.length === 1
      ? choices[0]?.value
      : undefined;
  const [lineId, directionId] = selectedKey?.split(':') ?? [];
  const effective: AlertDraft = { ...draft, lineId, directionId };

  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
    router.back();
  };
  const save = useMutation({
    mutationFn: (input: AlertInput) =>
      existing ? updateAlert(existing.id, input) : createAlert(input),
    onSuccess: done,
    onError: (cause) =>
      setError(
        cause instanceof ApiError && cause.status === 409
          ? t('alertForm.limit')
          : t('alertForm.saveError'),
      ),
  });
  const remove = useMutation({
    mutationFn: () => deleteAlert(existing?.id ?? ''),
    onSuccess: done,
    onError: () => setError(t('alertForm.saveError')),
  });

  async function onSave() {
    const input = buildAlertInput(effective, stopId);
    if (!input) {
      setError(t('alertForm.incomplete'));
      return;
    }
    setError(null);
    // Première alerte : c'est le bon moment pour demander l'autorisation (on comprend pourquoi).
    if (support === 'supported' && permission === 'undetermined') await requestPermission();
    save.mutate(input);
  }

  function onDelete() {
    Alert.alert(t('alertForm.deleteConfirmTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('alertForm.deleteConfirm'), style: 'destructive', onPress: () => remove.mutate() },
    ]);
  }

  if (!stopId) return <StopPicker onPick={setStopId} />;

  return (
    <Screen scroll>
      <Card style={styles.section}>
        <View style={styles.row}>
          <View style={styles.fill}>
            <AppText variant="heading">
              {stop.data
                ? localizedName(stop.data, locale)
                : existing
                  ? localizedName(existing.stop, locale)
                  : '…'}
            </AppText>
          </View>
          {existing ? null : (
            <Pressable accessibilityRole="button" onPress={() => setStopId(undefined)} hitSlop={8}>
              <AppText weight="semiBold">{t('alertForm.changeStop')}</AppText>
            </Pressable>
          )}
        </View>

        <AppText weight="medium">{t('alertForm.line')}</AppText>
        {stop.isPending ? (
          <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} />
        ) : choices.length === 0 ? (
          <AppText color="textMuted">{t('alertForm.noLines')}</AppText>
        ) : (
          <ChoiceChips
            accessibilityLabel={t('alertForm.line')}
            choices={choices}
            selected={selectedKey ? [selectedKey] : []}
            onPress={(value) => {
              const [nextLine, nextDirection] = value.split(':');
              setDraft({ ...draft, lineId: nextLine, directionId: nextDirection });
            }}
          />
        )}
      </Card>

      <Card style={styles.section}>
        <ToggleRow
          label={t('alertForm.notifyApproach')}
          hint={t('alertForm.notifyApproachHint')}
          value={draft.notifyApproach}
          onChange={(notifyApproach) => setDraft({ ...draft, notifyApproach })}
        />
        {draft.notifyApproach ? (
          <>
            <AppText>{t('alertForm.lead')}</AppText>
            <SegmentedControl
              accessibilityLabel={t('alertForm.lead')}
              value={String(draft.leadMinutes)}
              onChange={(value) => setDraft({ ...draft, leadMinutes: Number(value) })}
              options={ALERT_RULES.leadMinutesOptions.map((minutes) => ({
                value: String(minutes),
                label: t('alertForm.leadOption', { minutes }),
              }))}
            />
          </>
        ) : null}
        <ToggleRow
          label={t('alertForm.notifyIncidents')}
          hint={t('alertForm.notifyIncidentsHint')}
          value={draft.notifyIncidents}
          onChange={(notifyIncidents) => setDraft({ ...draft, notifyIncidents })}
        />
      </Card>

      <Card style={styles.section}>
        <AppText weight="medium">{t('alertForm.days')}</AppText>
        <ChoiceChips
          mode="checkbox"
          accessibilityLabel={t('alertForm.days')}
          choices={WEEKDAY_KEYS.map((key, index) => ({
            value: index + 1,
            label: t(`weekdays.short.${key}`),
          }))}
          selected={draft.days}
          onPress={(day) => setDraft({ ...draft, days: toggleDay(draft.days, day) })}
        />
        <AppText weight="medium">{t('alertForm.window')}</AppText>
        <TimeStepper
          label={t('alertForm.from')}
          minutes={draft.startMinutes}
          onStep={(steps) => setDraft(shiftTime(draft, 'startMinutes', steps))}
        />
        <TimeStepper
          label={t('alertForm.to')}
          minutes={draft.endMinutes}
          onStep={(steps) => setDraft(shiftTime(draft, 'endMinutes', steps))}
        />
      </Card>

      {error ? <AppText color="notCame">{error}</AppText> : null}
      <Button label={t('alertForm.save')} loading={save.isPending} onPress={() => void onSave()} />
      {existing ? (
        <Button
          label={t('alertForm.delete')}
          variant="danger"
          loading={remove.isPending}
          onPress={onDelete}
        />
      ) : null}
    </Screen>
  );
}

/** Choix de l'arrêt : favoris d'abord, puis arrêts proches. */
function StopPicker({ onPick }: { onPick: (stopId: string) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const locale = currentLocale();
  const { favorites } = useFavorites();
  const location = useUserLocation();
  const position = location.status === 'granted' ? location.position : null;
  const nearby = useQuery({
    queryKey: queryKeys.nearbyStops(position ?? { latitude: 0, longitude: 0 }),
    queryFn: () => fetchNearbyStops(position ?? { latitude: 0, longitude: 0 }),
    enabled: position !== null,
  });
  const favoriteStops = favorites?.stops ?? [];
  const nearbyStops = (nearby.data ?? []).slice(0, 8);

  return (
    <Screen scroll>
      <AppText variant="heading">{t('alertForm.chooseStop')}</AppText>
      {favoriteStops.length > 0 ? (
        <Card style={styles.section}>
          <AppText weight="medium">{t('alertForm.favoriteStops')}</AppText>
          {favoriteStops.map((stop) => (
            <Pressable
              key={stop.id}
              accessibilityRole="button"
              onPress={() => onPick(stop.id)}
              style={styles.stopRow}
            >
              <AppText weight="semiBold" style={styles.fill} numberOfLines={1}>
                {localizedName(stop, locale)}
              </AppText>
              {stop.lines.map((line) => (
                <LineBadge key={line.id} code={line.code} color={line.color} size="small" />
              ))}
            </Pressable>
          ))}
        </Card>
      ) : null}
      <Card style={styles.section}>
        <AppText weight="medium">{t('alertForm.nearbyStops')}</AppText>
        {location.status === 'pending' || (position && nearby.isPending) ? (
          <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} />
        ) : nearbyStops.length === 0 ? (
          <AppText color="textMuted">{t('alertForm.noStops')}</AppText>
        ) : (
          nearbyStops.map((stop) => (
            <NearbyStopRow
              key={stop.id}
              stop={stop}
              locale={locale}
              onPress={() => onPick(stop.id)}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  section: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
});
