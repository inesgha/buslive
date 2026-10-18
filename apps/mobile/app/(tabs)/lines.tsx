import type { Favorites, Locale } from '@buslive/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { NetworkError } from '@/api/errors';
import { fetchLines, queryKeys } from '@/api/network';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { LineBadge } from '@/components/LineBadge';
import { LineRow } from '@/components/LineRow';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Screen } from '@/components/Screen';
import { useFavorites } from '@/favorites/useFavorites';
import { currentLocale } from '@/i18n';
import { localizedName } from '@/i18n/localized';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Liste des lignes actives (GET /lines), précédée des favoris de l'utilisateur connecté. */
export default function LinesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const locale = currentLocale();
  const { data, error, isPending, isRefetching, refetch } = useQuery({
    queryKey: queryKeys.lines,
    queryFn: fetchLines,
  });
  const { favorites } = useFavorites();

  if (isPending) {
    return (
      <Screen>
        <ActivityIndicator
          style={styles.loader}
          color={colors.text}
          accessibilityLabel={t('common.loading')}
        />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <EmptyState
          icon="cloud-offline-outline"
          title={t('lines.error')}
          message={
            error instanceof NetworkError ? t('common.networkError') : t('common.genericError')
          }
          action={{ label: t('common.retry'), onPress: () => void refetch() }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <OfflineBanner />
      <FlatList
        data={data}
        keyExtractor={(line) => line.id}
        ListHeaderComponent={<FavoritesHeader favorites={favorites} locale={locale} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/lines/[id]', params: { id: item.id } })}
          >
            <LineRow line={item} locale={locale} />
          </Pressable>
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.text}
          />
        }
        ListEmptyComponent={<EmptyState icon="bus-outline" title={t('lines.empty')} />}
      />
    </Screen>
  );
}

/** Lignes et arrêts favoris, en tête de liste (rien sans compte ou sans favori). */
function FavoritesHeader({ favorites, locale }: { favorites?: Favorites; locale: Locale }) {
  const { t } = useTranslation();
  if (!favorites || (favorites.lines.length === 0 && favorites.stops.length === 0)) return null;
  return (
    <View style={styles.favorites}>
      <AppText variant="heading">{t('favorites.title')}</AppText>
      {favorites.lines.map((line) => (
        <Pressable
          key={line.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/lines/[id]', params: { id: line.id } })}
        >
          <LineRow line={line} locale={locale} />
        </Pressable>
      ))}
      {favorites.stops.length > 0 ? (
        <Card style={styles.stops}>
          <AppText weight="medium">{t('favorites.stops')}</AppText>
          {favorites.stops.map((stop) => (
            <Pressable
              key={stop.id}
              accessibilityRole="button"
              // Ouvre l'arrêt sur la carte ; « at » rend chaque demande unique
              // (toucher deux fois le même arrêt le rouvre).
              onPress={() =>
                router.navigate({
                  pathname: '/',
                  params: {
                    stopId: stop.id,
                    lat: String(stop.latitude),
                    lng: String(stop.longitude),
                    at: String(Date.now()),
                  },
                })
              }
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
      <AppText variant="heading">{t('favorites.allLines')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1 },
  fill: { flex: 1 },
  favorites: { gap: spacing.md },
  stops: { gap: spacing.sm },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
});
