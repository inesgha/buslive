import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from 'react-native';

import { NetworkError } from '@/api/errors';
import { fetchLines } from '@/api/network';
import { EmptyState } from '@/components/EmptyState';
import { LineRow } from '@/components/LineRow';
import { Screen } from '@/components/Screen';
import { currentLocale } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Liste des lignes actives, chargée depuis l'API (GET /lines). */
export default function LinesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const locale = currentLocale();
  const { data, error, isPending, isRefetching, refetch } = useQuery({
    queryKey: ['lines'],
    queryFn: fetchLines,
  });

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
      <FlatList
        data={data}
        keyExtractor={(line) => line.id}
        renderItem={({ item }) => <LineRow line={item} locale={locale} />}
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

const styles = StyleSheet.create({
  loader: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
});
