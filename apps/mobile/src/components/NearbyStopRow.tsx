import type { Locale, NearbyStop } from '@buslive/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { localizedName } from '@/i18n/localized';
import { formatDistance } from '@/time/format';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { LineBadge } from './LineBadge';

interface NearbyStopRowProps {
  stop: NearbyStop;
  locale: Locale;
  onPress: () => void;
}

/** Un arrêt proche : nom, localité, distance et lignes qui le desservent. */
export function NearbyStopRow({ stop, locale, onPress }: NearbyStopRowProps) {
  const { t } = useTranslation();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={styles.text}>
        <AppText weight="semiBold" numberOfLines={1}>
          {localizedName(stop, locale)}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {formatDistance(stop.distanceMeters, t)}
          {stop.locality ? ` · ${localizedName(stop.locality, locale)}` : ''}
        </AppText>
      </View>
      <View style={styles.badges}>
        {stop.lines.map((line) => (
          <LineBadge key={line.id} code={line.code} color={line.color} size="small" />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52 },
  text: { flex: 1 },
  badges: { flexDirection: 'row', gap: spacing.xs },
});
