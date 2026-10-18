import type { Locale, ServiceClock, StopPassage } from '@buslive/shared';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { localizedHeadsign } from '@/i18n/localized';
import { formatPassage } from '@/time/format';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { LineBadge } from './LineBadge';

interface PassageRowProps {
  passage: StopPassage;
  clock: ServiceClock;
  locale: Locale;
}

/** Un prochain passage : pastille de la ligne, destination et heure (« dans 5 min »). */
export function PassageRow({ passage, clock, locale }: PassageRowProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <LineBadge code={passage.line.code} color={passage.line.color} size="small" />
      <AppText style={styles.headsign} numberOfLines={1}>
        {localizedHeadsign(passage.direction, locale)}
      </AppText>
      <AppText weight="semiBold">{formatPassage(passage, clock, t)}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  headsign: { flex: 1 },
});
