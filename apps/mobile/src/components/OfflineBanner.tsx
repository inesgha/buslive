import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useIsOnline } from '@/hooks/useIsOnline';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';

/** Bandeau affiché sans réseau : les horaires viennent du cache (théoriques). */
export function OfflineBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const online = useIsOnline();
  if (online) return null;

  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.delay }]}
    >
      <Ionicons name="cloud-offline-outline" size={18} color={colors.delay} />
      <AppText variant="caption" weight="medium" color="delay">
        {t('offline.banner')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
  },
});
