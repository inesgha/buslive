import type { LineSummary } from '@buslive/shared';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { fetchLines, queryKeys } from '@/api/network';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { LineBadge } from '@/components/LineBadge';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { currentLocale } from '@/i18n';
import { localizedHeadsign, localizedName } from '@/i18n/localized';
import { isExpoGo } from '@/live/environment';
import { LocationPermissionError, useShare } from '@/live/ShareProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/** « Je suis dans le bus » : choisir sa ligne et son sens, puis partager la position du bus. */
export default function ShareScreen() {
  const { t } = useTranslation();
  const { state: auth } = useAuth();
  const { status } = useShare();

  if (status.kind === 'sharing') return <SharingView />;
  if (status.kind === 'ended') return <EndedView />;

  if (auth.status !== 'signedIn') {
    return (
      <Screen scroll>
        <AppText>{t('share.signInRequired')}</AppText>
        <Button label={t('profile.signIn')} onPress={() => router.push('/auth/login')} />
      </Screen>
    );
  }
  return <StartView />;
}

function StartView() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const locale = currentLocale();
  const { start } = useShare();
  const params = useLocalSearchParams<{ lineId?: string }>();
  const lines = useQuery({ queryKey: queryKeys.lines, queryFn: fetchLines });
  const [lineId, setLineId] = useState<string | undefined>(params.lineId);
  const [directionId, setDirectionId] = useState<string | undefined>();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const line: LineSummary | undefined = lines.data?.find((l) => l.id === lineId);
  const direction = line?.directions.find((d) => d.id === directionId) ?? line?.directions[0];

  async function onStart() {
    if (!line || !direction) return;
    setError(null);
    setStarting(true);
    try {
      await start(line, direction);
    } catch (e) {
      setError(
        e instanceof LocationPermissionError ? t('share.permissionDenied') : t('share.error'),
      );
    } finally {
      setStarting(false);
    }
  }

  if (lines.isPending) return <ActivityIndicator style={styles.fill} color={colors.text} />;

  return (
    <Screen scroll>
      <AppText variant="heading">{t('share.chooseLine')}</AppText>
      <View style={styles.lines}>
        {(lines.data ?? []).map((item) => {
          const selected = item.id === lineId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${item.code} ${localizedName(item, locale)}`}
              onPress={() => {
                setLineId(item.id);
                setDirectionId(undefined);
              }}
              style={[
                styles.lineChoice,
                {
                  borderColor: selected ? colors.text : colors.border,
                  backgroundColor: colors.card,
                },
              ]}
            >
              <LineBadge code={item.code} color={item.color} size="small" />
              <AppText style={styles.fill} numberOfLines={1}>
                {localizedName(item, locale)}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {line && direction ? (
        <>
          <AppText variant="heading">{t('share.chooseDirection')}</AppText>
          <SegmentedControl
            accessibilityLabel={t('share.chooseDirection')}
            value={direction.id}
            onChange={setDirectionId}
            options={line.directions.map((d) => ({
              value: d.id,
              label: localizedHeadsign(d, locale),
            }))}
          />
        </>
      ) : null}

      {/* Information claire AVANT de demander la position en arrière-plan (exigée par Google Play). */}
      {!isExpoGo() ? (
        <AppText variant="caption" color="textMuted">
          {t('share.disclosure')}
        </AppText>
      ) : null}

      {error ? <AppText color="notCame">{error}</AppText> : null}
      <Button
        label={t('share.start')}
        onPress={() => void onStart()}
        loading={starting}
        disabled={!line || !direction}
      />
    </Screen>
  );
}

function SharingView() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const locale = currentLocale();
  const { status, stop } = useShare();
  const [stopping, setStopping] = useState(false);
  if (status.kind !== 'sharing') return null;
  const { sharing, last, foregroundReason } = status;
  const headsign = localizedHeadsign(sharing, locale);

  return (
    <Screen scroll>
      <Card style={styles.section}>
        <View style={styles.row}>
          <View style={[styles.liveDot, { backgroundColor: colors.live }]} />
          <AppText weight="semiBold" color="live">
            {t('live.label')}
          </AppText>
        </View>
        <AppText variant="heading">{t('share.sharing')}</AppText>
        <View style={styles.row}>
          <LineBadge code={sharing.lineCode} color={sharing.lineColor} />
          <AppText style={styles.fill}>{headsign}</AppText>
        </View>
        {last === null ? (
          <AppText color="textMuted">{t('share.waitingFirstPosition')}</AppText>
        ) : last.onRoute ? (
          <AppText color="textMuted">
            {t('share.sharers', { count: last.sharersOnVehicle })}
          </AppText>
        ) : (
          <AppText color="delay">{t('share.offRoute')}</AppText>
        )}
      </Card>

      {foregroundReason ? (
        <Card style={[styles.section, { borderColor: colors.delay }]}>
          <AppText color="delay">
            {foregroundReason === 'expoGo'
              ? t('share.foregroundOnlyExpoGo')
              : t('share.foregroundOnlyPermission')}
          </AppText>
        </Card>
      ) : null}

      <Button
        label={t('share.stop')}
        variant="danger"
        loading={stopping}
        onPress={() => {
          setStopping(true);
          void stop().finally(() => setStopping(false));
        }}
      />
    </Screen>
  );
}

function EndedView() {
  const { t } = useTranslation();
  const { status, dismiss } = useShare();
  if (status.kind !== 'ended') return null;
  return (
    <Screen scroll>
      <AppText variant="heading">{t(`share.ended.${status.reason}`)}</AppText>
      <Button
        label={t('share.close')}
        onPress={() => {
          dismiss();
          router.back();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  lines: { gap: spacing.sm },
  lineChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
  },
  section: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveDot: { width: 10, height: 10, borderRadius: 5 },
});
