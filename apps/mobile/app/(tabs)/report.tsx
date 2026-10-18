import Ionicons from '@expo/vector-icons/Ionicons';
import {
  distanceMeters,
  minutesToTime,
  type Report,
  REPORT_TYPES,
  type ReportType,
} from '@buslive/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/errors';
import { fetchLine, fetchLines, queryKeys } from '@/api/network';
import { createReport } from '@/api/reports';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { LineBadge } from '@/components/LineBadge';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useUserLocation } from '@/hooks/useUserLocation';
import { currentLocale } from '@/i18n';
import { localizedHeadsign, localizedName } from '@/i18n/localized';
import { useShare } from '@/live/ShareProvider';
import {
  buildReportInput,
  DELAY_OPTIONS,
  passageChoices,
  type ReportDraft,
  stepsFor,
} from '@/reports/reportForm';
import { REPORT_VISUALS } from '@/reports/reportVisuals';
import { formatDistance } from '@/time/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/** Onglet « Signaler » : pas venu, passé, plein, retard, panne, arrêt déplacé. */
export default function ReportScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { state: auth } = useAuth();
  const [result, setResult] = useState<Report | null>(null);

  if (auth.status !== 'signedIn') {
    return (
      <Screen scroll>
        <AppText>{t('report.signInRequired')}</AppText>
        <Button label={t('profile.signIn')} onPress={() => router.push('/auth/login')} />
      </Screen>
    );
  }

  if (result) {
    return (
      <Screen scroll>
        <Ionicons name="checkmark-circle" size={48} color={colors.live} />
        <AppText variant="heading">
          {/* mine = false : le problème était déjà signalé, notre envoi l'a confirmé. */}
          {result.mine ? t('report.success') : t('report.merged')}
        </AppText>
        <Button label={t('report.another')} onPress={() => setResult(null)} />
      </Screen>
    );
  }
  return <ReportForm onSent={setResult} />;
}

function ReportForm({ onSent }: { onSent: (report: Report) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const locale = currentLocale();
  const location = useUserLocation();
  const { status: share } = useShare();
  const [draft, setDraft] = useState<ReportDraft>({});

  // Valeurs par défaut DÉDUITES (pas recopiées dans l'état) : le bus partagé
  // s'il y en a un, puis l'arrêt le plus proche de la position.
  const sharing = share.kind === 'sharing' ? share.sharing : null;
  const lineId = draft.lineId ?? sharing?.lineId;
  const lines = useQuery({ queryKey: queryKeys.lines, queryFn: fetchLines });
  const line = useQuery({
    queryKey: queryKeys.line(lineId ?? ''),
    queryFn: () => fetchLine(lineId ?? ''),
    enabled: lineId !== undefined,
  });
  const detail = line.data;
  const directionId =
    draft.directionId ??
    (sharing?.lineId === lineId ? sharing?.directionId : undefined) ??
    detail?.directions[0]?.id;
  const direction = detail?.directions.find((d) => d.id === directionId);

  const position = location.status === 'granted' ? location.position : null;
  const stopsByDistance = useMemo(() => {
    const stops = direction?.stops.map((s) => s.stop) ?? [];
    if (!position) return stops.map((stop) => ({ stop, distance: null }));
    return stops
      .map((stop) => ({ stop, distance: distanceMeters(position, stop) }))
      .sort((a, b) => a.distance - b.distance);
  }, [direction, position]);
  const stopId = draft.stopId ?? stopsByDistance[0]?.stop.id;

  const passages = useMemo(
    () =>
      direction && detail && stopId ? passageChoices(direction, detail.calendars, stopId) : [],
    [direction, detail, stopId],
  );

  const steps = draft.type ? stepsFor(draft.type) : ['type'];
  const effective: ReportDraft = { ...draft, lineId, directionId, stopId };
  const input = buildReportInput(
    effective,
    position && location.status === 'granted'
      ? { ...position, accuracy: location.accuracy ?? 100 }
      : undefined,
  );

  const send = useMutation({ mutationFn: createReport, onSuccess: onSent });
  const sendError =
    send.error instanceof ApiError && send.error.status === 429
      ? t('report.tooMany')
      : send.error
        ? t('report.error')
        : null;

  const update = (patch: Partial<ReportDraft>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <Screen scroll>
      <AppText variant="heading">{t('report.chooseType')}</AppText>
      <View style={styles.grid}>
        {REPORT_TYPES.map((type) => (
          <TypeTile
            key={type}
            type={type}
            selected={draft.type === type}
            onPress={() => update({ type, passage: undefined, delayMinutes: undefined })}
          />
        ))}
      </View>

      {steps.includes('line') ? (
        <>
          <AppText variant="heading">{t('report.chooseLine')}</AppText>
          <View style={styles.chips}>
            {(lines.data ?? []).map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: item.id === lineId }}
                accessibilityLabel={`${item.code} ${localizedName(item, locale)}`}
                onPress={() =>
                  update({
                    lineId: item.id,
                    directionId: undefined,
                    stopId: undefined,
                    passage: undefined,
                  })
                }
                style={[
                  styles.lineChip,
                  { borderColor: item.id === lineId ? colors.text : colors.border },
                ]}
              >
                <LineBadge code={item.code} color={item.color} size="small" />
              </Pressable>
            ))}
          </View>
          {detail && detail.directions.length > 1 && directionId ? (
            <>
              <AppText variant="heading">{t('report.chooseDirection')}</AppText>
              <SegmentedControl
                accessibilityLabel={t('report.chooseDirection')}
                value={directionId}
                onChange={(id) =>
                  update({ directionId: id, stopId: undefined, passage: undefined })
                }
                options={detail.directions.map((d) => ({
                  value: d.id,
                  label: localizedHeadsign(d, locale),
                }))}
              />
            </>
          ) : null}
        </>
      ) : null}

      {steps.includes('stop') && direction ? (
        <>
          <AppText variant="heading">{t('report.chooseStop')}</AppText>
          {draft.type === 'STOP_MOVED' ? (
            <AppText variant="caption" color={position ? 'textMuted' : 'notCame'}>
              {position ? t('report.stopMovedHint') : t('report.locationRequired')}
            </AppText>
          ) : null}
          {stopsByDistance.map(({ stop, distance }) => (
            <Choice
              key={stop.id}
              selected={stop.id === stopId}
              label={localizedName(stop, locale)}
              detail={distance !== null ? formatDistance(distance, t) : undefined}
              onPress={() => update({ stopId: stop.id, passage: undefined })}
            />
          ))}
        </>
      ) : null}

      {steps.includes('passage') && stopId ? (
        <>
          <AppText variant="heading">{t('report.choosePassage')}</AppText>
          <View style={styles.chips}>
            {passages.map((passage) => {
              const selected =
                draft.passage?.serviceDate === passage.serviceDate &&
                draft.passage.passingMinutes === passage.passingMinutes;
              return (
                <Chip
                  key={`${passage.serviceDate}-${passage.passingMinutes}`}
                  label={minutesToTime(passage.passingMinutes)}
                  selected={selected}
                  onPress={() =>
                    update({
                      passage: {
                        serviceDate: passage.serviceDate,
                        passingMinutes: passage.passingMinutes,
                      },
                    })
                  }
                />
              );
            })}
            <Chip
              label={t('report.unknownPassage')}
              selected={draft.passage === null}
              onPress={() => update({ passage: null })}
            />
          </View>
        </>
      ) : null}

      {steps.includes('delay') ? (
        <>
          <AppText variant="heading">{t('report.chooseDelay')}</AppText>
          <View style={styles.chips}>
            {DELAY_OPTIONS.map((minutes) => (
              <Chip
                key={minutes}
                label={t('report.delayOption', { count: minutes })}
                selected={draft.delayMinutes === minutes}
                onPress={() => update({ delayMinutes: minutes })}
              />
            ))}
          </View>
        </>
      ) : null}

      {sendError ? <AppText color="notCame">{sendError}</AppText> : null}
      {draft.type ? (
        <Button
          label={t('report.submit')}
          onPress={() => input && send.mutate(input)}
          loading={send.isPending}
          disabled={!input}
        />
      ) : null}
    </Screen>
  );
}

function TypeTile({
  type,
  selected,
  onPress,
}: {
  type: ReportType;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const visual = REPORT_VISUALS[type];
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.tile,
        {
          backgroundColor: colors.card,
          borderColor: selected ? colors[visual.color] : colors.border,
        },
        selected && styles.tileSelected,
      ]}
    >
      <Ionicons name={visual.icon} size={28} color={colors[visual.color]} />
      <AppText weight="semiBold" style={styles.center}>
        {t(`report.types.${type}`)}
      </AppText>
    </Pressable>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: colors.border, backgroundColor: selected ? colors.accent : colors.card },
      ]}
    >
      <AppText weight={selected ? 'semiBold' : 'regular'} color={selected ? 'onAccent' : 'text'}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Choice({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.choice,
        { borderColor: selected ? colors.text : colors.border, backgroundColor: colors.card },
      ]}
    >
      <AppText style={styles.fill}>{label}</AppText>
      {detail ? (
        <AppText variant="caption" color="textMuted">
          {detail}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '48%',
    minHeight: 88,
    borderWidth: 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  tileSelected: { borderWidth: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  lineChip: { borderWidth: 2, borderRadius: radius.sm, padding: 2 },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 2,
    borderRadius: radius.md,
  },
});
