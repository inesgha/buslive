import {
  departuresForDate,
  type LineDetail,
  minutesToTime,
  upcomingPassages,
} from '@buslive/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { fetchLine, queryKeys } from '@/api/network';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { LineBadge } from '@/components/LineBadge';
import { OfflineBanner } from '@/components/OfflineBanner';
import { SegmentedControl } from '@/components/SegmentedControl';
import { StopMarker } from '@/components/StopMarker';
import { useServiceClock } from '@/hooks/useServiceClock';
import { currentLocale } from '@/i18n';
import { localizedHeadsign, localizedName } from '@/i18n/localized';
import { formatPassage } from '@/time/format';
import { darkMapStyle } from '@/theme/mapStyle';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/** Détail d'une ligne : tracé, arrêts avec le prochain passage, départs du jour. */
export default function LineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const locale = currentLocale();
  const {
    data: line,
    error,
    isPending,
    refetch,
  } = useQuery({
    queryKey: queryKeys.line(id),
    queryFn: () => fetchLine(id),
  });

  const title = line ? `${line.code} · ${localizedName(line, locale)}` : '';

  return (
    <>
      <Stack.Screen options={{ title }} />
      <OfflineBanner />
      {isPending ? (
        <ActivityIndicator
          style={styles.fill}
          color={colors.text}
          accessibilityLabel={t('common.loading')}
        />
      ) : error && !line ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={t('lineDetail.error')}
          action={{ label: t('common.retry'), onPress: () => void refetch() }}
        />
      ) : line ? (
        <LineContent line={line} />
      ) : null}
    </>
  );
}

function LineContent({ line }: { line: LineDetail }) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const locale = currentLocale();
  const clock = useServiceClock();
  const [directionId, setDirectionId] = useState(line.directions[0]?.id ?? '');
  const direction = line.directions.find((d) => d.id === directionId) ?? line.directions[0];

  // Calculs faits sur le téléphone avec les fonctions partagées : marchent hors ligne.
  const nextByStop = useMemo(
    () =>
      (direction?.stops ?? []).map(
        (lineStop) =>
          upcomingPassages(
            [
              {
                key: lineStop.stop.id,
                minutesFromStart: lineStop.minutesFromStart,
                departures: direction?.departures ?? [],
              },
            ],
            line.calendars,
            clock,
            { limit: 1 },
          )[0] ?? null,
      ),
    [direction, line.calendars, clock],
  );
  const todayDepartures = useMemo(
    () => departuresForDate(direction?.departures ?? [], line.calendars, clock.isoDate),
    [direction, line.calendars, clock.isoDate],
  );

  if (!direction) return null;
  const coordinates =
    direction.shape ??
    direction.stops.map(({ stop }) => ({ latitude: stop.latitude, longitude: stop.longitude }));

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <View style={styles.heading}>
        <LineBadge code={line.code} color={line.color} />
        <AppText variant="heading" style={styles.fill}>
          {localizedName(line, locale)}
        </AppText>
      </View>

      {line.directions.length > 1 ? (
        <SegmentedControl
          accessibilityLabel={t('lines.title')}
          value={direction.id}
          onChange={setDirectionId}
          options={line.directions.map((d) => ({
            value: d.id,
            label: localizedHeadsign(d, locale),
          }))}
        />
      ) : null}

      <View style={[styles.map, { borderColor: colors.border }]}>
        <MapView
          style={StyleSheet.absoluteFill}
          customMapStyle={scheme === 'dark' ? darkMapStyle : []}
          // Aperçu fixe : évite les conflits avec le défilement de l'écran.
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          initialRegion={regionFor(coordinates)}
        >
          <Polyline coordinates={coordinates} strokeColor={line.color} strokeWidth={4} />
          {direction.stops.map(({ stop }) => (
            <Marker
              key={stop.id}
              coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
              tracksViewChanges={false}
            >
              <StopMarker />
            </Marker>
          ))}
        </MapView>
      </View>

      <Card style={styles.section}>
        <AppText variant="heading">{t('lineDetail.stops')}</AppText>
        {direction.stops.map((lineStop, index) => {
          const next = nextByStop[index];
          return (
            <View key={`${lineStop.sequence}`} style={styles.stopRow}>
              <View style={[styles.dot, { backgroundColor: line.color }]} />
              <AppText style={styles.fill}>{localizedName(lineStop.stop, locale)}</AppText>
              <AppText variant="caption" weight="medium" color={next ? 'text' : 'textMuted'}>
                {next ? formatPassage(next, clock, t) : '—'}
              </AppText>
            </View>
          );
        })}
      </Card>

      <Card style={styles.section}>
        <AppText variant="heading">{t('lineDetail.todayDepartures')}</AppText>
        {todayDepartures.length === 0 ? (
          <AppText color="textMuted">{t('lineDetail.noServiceToday')}</AppText>
        ) : (
          <View style={styles.chips}>
            {todayDepartures.map((minutes) => {
              const past = minutes < clock.minutes;
              return (
                <View
                  key={minutes}
                  style={[styles.chip, { borderColor: colors.border }, past && styles.past]}
                >
                  <AppText variant="caption" color={past ? 'textMuted' : 'text'}>
                    {minutesToTime(minutes)}
                  </AppText>
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </ScrollView>
  );
}

/** Région de carte qui englobe tous les points du tracé (avec une marge). */
function regionFor(points: { latitude: number; longitude: number }[]) {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.4),
  };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  map: { height: 200, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1 },
  section: { gap: spacing.sm },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 36 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  past: { opacity: 0.5 },
});
