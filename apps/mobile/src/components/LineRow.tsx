import type { LineSummary, Locale } from '@buslive/shared';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { localizedHeadsign, localizedName } from '@/i18n/localized';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Card } from './Card';
import { LineBadge } from './LineBadge';

/** Une ligne dans la liste : pastille, nom, type et destinations, dans la langue affichée. */
export function LineRow({ line, locale }: { line: LineSummary; locale: Locale }) {
  const { t } = useTranslation();
  const headsigns = line.directions.map((direction) => localizedHeadsign(direction, locale));

  return (
    <Card style={styles.row}>
      <LineBadge code={line.code} color={line.color} />
      <View style={styles.text}>
        <AppText weight="semiBold">{localizedName(line, locale)}</AppText>
        <AppText variant="caption" color="textMuted">
          {t(`lines.type.${line.type}`)}
        </AppText>
        {headsigns.length > 0 ? (
          <AppText variant="caption" color="textMuted" numberOfLines={2}>
            {headsigns.join(' · ')}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
});
