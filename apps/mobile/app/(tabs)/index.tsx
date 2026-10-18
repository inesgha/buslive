import { distanceMeters, type GeoPoint } from '@buslive/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { fetchNearbyStops, queryKeys } from '@/api/network';
import { AppText } from '@/components/AppText';
import { BusMarker } from '@/components/BusMarker';
import { NearbyStopRow } from '@/components/NearbyStopRow';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StopMarker } from '@/components/StopMarker';
import { StopPassagesPanel } from '@/components/StopPassagesPanel';
import { useUserLocation } from '@/hooks/useUserLocation';
import { currentLocale } from '@/i18n';
import { localizedName } from '@/i18n/localized';
import { useShare } from '@/live/ShareProvider';
import { useLineVehicles } from '@/live/useLineVehicles';
import { darkMapStyle } from '@/theme/mapStyle';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/** Centre par défaut (Mahdia) si la position n'est pas disponible. */
const MAHDIA: GeoPoint = { latitude: 35.5047, longitude: 11.0622 };
const ZOOM = { latitudeDelta: 0.03, longitudeDelta: 0.03 };
/** Au-delà de cette distance entre la carte et la dernière recherche, on propose de rechercher ici. */
const SEARCH_AGAIN_METERS = 500;

/** Carte en direct : arrêts proches et prochains passages. */
export default function MapScreen() {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const locale = currentLocale();
  const location = useUserLocation();
  const mapRef = useRef<MapView>(null);

  const [mapCenter, setMapCenter] = useState<GeoPoint>(MAHDIA);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  // Centre choisi avec « Rechercher dans cette zone » (null = suivre l'utilisateur).
  const [manualCenter, setManualCenter] = useState<GeoPoint | null>(null);

  const userPosition = location.status === 'granted' ? location.position : null;
  // Centre de recherche : choix manuel, sinon position de l'utilisateur, sinon Mahdia.
  const searchCenter = manualCenter ?? userPosition ?? MAHDIA;

  // Une seule fois, dès que la position est connue : centrer la carte sur l'utilisateur.
  const centeredOnUser = useRef(false);
  useEffect(() => {
    if (!userPosition || centeredOnUser.current) return;
    centeredOnUser.current = true;
    mapRef.current?.animateToRegion({ ...userPosition, ...ZOOM }, 500);
  }, [userPosition]);

  const nearby = useQuery({
    queryKey: queryKeys.nearbyStops(searchCenter),
    queryFn: () => fetchNearbyStops(searchCenter),
    // Pendant une nouvelle recherche, on garde les arrêts affichés.
    placeholderData: keepPreviousData,
  });
  // useMemo : « ?? [] » créerait un nouveau tableau à chaque affichage.
  const stops = useMemo(() => nearby.data ?? [], [nearby.data]);
  const selectedStop = stops.find((stop) => stop.id === selectedStopId) ?? null;
  const canSearchHere = distanceMeters(mapCenter, searchCenter) > SEARCH_AGAIN_METERS;

  // Bus en direct des lignes qui desservent les arrêts affichés.
  const lineColors = useMemo(
    () =>
      new Map(stops.flatMap((stop) => stop.lines.map((line) => [line.id, line.color] as const))),
    [stops],
  );
  const vehicles = useLineVehicles([...lineColors.keys()]);
  const { status: share } = useShare();

  function onRegionChangeComplete(region: Region) {
    setMapCenter({ latitude: region.latitude, longitude: region.longitude });
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <OfflineBanner />
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{ ...MAHDIA, ...ZOOM }}
          customMapStyle={scheme === 'dark' ? darkMapStyle : []}
          showsUserLocation={location.status === 'granted'}
          showsMyLocationButton
          onRegionChangeComplete={onRegionChangeComplete}
          onPress={() => setSelectedStopId(null)}
        >
          {stops.map((stop) => (
            <Marker
              // La sélection fait partie de la clé : le marqueur (figé, voir
              // tracksViewChanges) est recréé quand on le sélectionne.
              key={`${stop.id}-${stop.id === selectedStopId}`}
              coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
              title={localizedName(stop, locale)}
              onPress={() => setSelectedStopId(stop.id)}
              // Marqueur personnalisé figé : évite de le redessiner en continu (performances Android).
              tracksViewChanges={false}
            >
              <StopMarker selected={stop.id === selectedStopId} />
            </Marker>
          ))}
          {vehicles.map((vehicle) => (
            <Marker
              key={vehicle.id}
              coordinate={{ latitude: vehicle.latitude, longitude: vehicle.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <BusMarker color={lineColors.get(vehicle.lineId) ?? colors.text} />
            </Marker>
          ))}
        </MapView>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/share')}
          style={[
            styles.shareButton,
            { backgroundColor: share.kind === 'sharing' ? colors.live : colors.accent },
          ]}
        >
          <Ionicons
            name={share.kind === 'sharing' ? 'radio' : 'bus'}
            size={18}
            color={share.kind === 'sharing' ? colors.card : colors.onAccent}
          />
          <AppText weight="semiBold" color={share.kind === 'sharing' ? 'card' : 'onAccent'}>
            {share.kind === 'sharing' ? t('share.buttonActive') : t('share.button')}
          </AppText>
        </Pressable>

        {canSearchHere ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setManualCenter(mapCenter)}
            style={[
              styles.searchHere,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Ionicons name="search" size={16} color={colors.text} />
            <AppText variant="caption" weight="semiBold">
              {t('map.searchHere')}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {location.status === 'denied' ? (
          <AppText variant="caption" color="textMuted">
            {t('map.locationDenied')}
          </AppText>
        ) : null}

        {selectedStop ? (
          <StopPassagesPanel stop={selectedStop} onClose={() => setSelectedStopId(null)} />
        ) : (
          <>
            <AppText variant="heading">{t('map.nearbyStops')}</AppText>
            {nearby.isPending ? (
              <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} />
            ) : nearby.error && !nearby.data ? (
              <AppText color="notCame">{t('map.stopsError')}</AppText>
            ) : (
              <FlatList
                data={stops}
                keyExtractor={(stop) => stop.id}
                renderItem={({ item }) => (
                  <NearbyStopRow
                    stop={item}
                    locale={locale}
                    onPress={() => {
                      setSelectedStopId(item.id);
                      mapRef.current?.animateToRegion(
                        { latitude: item.latitude, longitude: item.longitude, ...ZOOM },
                        400,
                      );
                    }}
                  />
                )}
                ListEmptyComponent={<AppText color="textMuted">{t('map.noStopsNearby')}</AppText>}
              />
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  mapContainer: { flex: 1 },
  searchHere: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    elevation: 3,
  },
  shareButton: {
    position: 'absolute',
    bottom: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    elevation: 4,
  },
  panel: {
    maxHeight: '45%',
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
