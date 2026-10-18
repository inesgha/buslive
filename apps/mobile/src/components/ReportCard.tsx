import Ionicons from '@expo/vector-icons/Ionicons';
import { type Locale, minutesToTime, type Report, type VoteValue } from '@buslive/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { localizedHeadsign, localizedName } from '@/i18n/localized';
import { REPORT_VISUALS } from '@/reports/reportVisuals';
import { useVote } from '@/reports/useVote';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { LineBadge } from './LineBadge';

/**
 * Un signalement : type (icône et couleur), ligne, arrêt, horaire concerné,
 * confirmations, et boutons « Je confirme » / « Ce n'est pas vrai ».
 */
export function ReportCard({ report, locale }: { report: Report; locale: Locale }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { state: auth } = useAuth();
  const vote = useVote();
  const visual = REPORT_VISUALS[report.type];

  const details = [
    report.stop ? localizedName(report.stop, locale) : null,
    report.direction ? localizedHeadsign(report.direction, locale) : null,
    report.scheduledMinutes !== null
      ? t('reports.busAt', { time: minutesToTime(report.scheduledMinutes) })
      : null,
    report.delayMinutes !== null ? t('reports.delay', { count: report.delayMinutes }) : null,
  ].filter(Boolean);

  const canVote =
    report.status === 'ACTIVE' &&
    !report.mine &&
    report.myVote === null &&
    auth.status === 'signedIn';

  function onVote(value: VoteValue) {
    vote.mutate({ reportId: report.id, value });
  }

  return (
    <View style={[styles.card, { borderColor: colors[visual.color] }]}>
      <View style={styles.header}>
        <Ionicons name={visual.icon} size={20} color={colors[visual.color]} />
        <AppText weight="semiBold" color={visual.color} style={styles.fill}>
          {t(`report.types.${report.type}`)}
        </AppText>
        {report.status === 'CONFIRMED' ? (
          <View style={[styles.pill, { backgroundColor: colors.live }]}>
            <AppText variant="caption" weight="semiBold" color="card">
              {t('reports.confirmed')}
            </AppText>
          </View>
        ) : null}
        <LineBadge code={report.line.code} color={report.line.color} size="small" />
      </View>

      {details.length > 0 ? (
        <AppText variant="caption" color="textMuted">
          {details.join(' · ')}
        </AppText>
      ) : null}
      <AppText variant="caption" color="textMuted">
        {t('reports.confirmations', { count: report.confirmations })}
      </AppText>

      {report.mine ? (
        <AppText variant="caption" weight="medium">
          {t('reports.mine')}
        </AppText>
      ) : report.myVote !== null || vote.isSuccess ? (
        <AppText variant="caption" weight="medium" color="live">
          {t('reports.thanks')}
        </AppText>
      ) : canVote ? (
        <View style={styles.actions}>
          <VoteButton
            label={t('reports.confirm')}
            onPress={() => onVote('CONFIRM')}
            disabled={vote.isPending}
          />
          <VoteButton
            label={t('reports.deny')}
            onPress={() => onVote('DENY')}
            disabled={vote.isPending}
          />
        </View>
      ) : report.status === 'ACTIVE' && auth.status !== 'signedIn' ? (
        <AppText variant="caption" color="textMuted">
          {t('reports.signInToVote')}
        </AppText>
      ) : null}

      {vote.isError ? (
        <AppText variant="caption" color="notCame">
          {t('reports.voteError')}
        </AppText>
      ) : null}
    </View>
  );
}

function VoteButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.voteButton,
        { borderColor: colors.border, backgroundColor: colors.card },
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <AppText variant="caption" weight="semiBold">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderStartWidth: 4,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fill: { flex: 1 },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  voteButton: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.6 },
});
