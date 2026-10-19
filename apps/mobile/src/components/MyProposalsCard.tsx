import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { queryKeys } from '@/api/network';
import { fetchMyStopProposals } from '@/api/proposals';
import { currentLocale } from '@/i18n';
import { localizedName } from '@/i18n/localized';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Card } from './Card';

const STATUS_COLOR = { PENDING: 'textMuted', ACTIVE: 'live', REJECTED: 'notCame' } as const;

/** Profil → mes arrêts proposés et leur statut (rien s'il n'y en a pas). */
export function MyProposalsCard() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const { data } = useQuery({ queryKey: queryKeys.myStopProposals, queryFn: fetchMyStopProposals });
  if (!data || data.length === 0) return null;

  return (
    <Card style={styles.card}>
      <AppText variant="heading">{t('proposal.mine')}</AppText>
      {data.map((proposal) => (
        <View key={proposal.id} style={styles.row}>
          <AppText style={styles.fill} numberOfLines={1}>
            {localizedName(proposal, locale)}
          </AppText>
          <AppText variant="caption" weight="semiBold" color={STATUS_COLOR[proposal.status]}>
            {t(`proposal.status.${proposal.status}`)}
          </AppText>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  fill: { flex: 1 },
});
