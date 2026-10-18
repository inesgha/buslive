import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { queryKeys } from '@/api/network';
import { fetchLineReports } from '@/api/reports';
import { useNow } from '@/hooks/useNow';
import { currentLocale } from '@/i18n';
import { useReportUpdates } from '@/reports/useReportUpdates';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Card } from './Card';
import { ReportCard } from './ReportCard';

/** Signalements en cours d'une ligne, mis à jour en temps réel (Socket.io). */
export function LineReportsSection({ lineId }: { lineId: string }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const now = useNow();
  useReportUpdates([lineId]);
  const { data } = useQuery({
    queryKey: queryKeys.lineReports(lineId),
    queryFn: () => fetchLineReports(lineId),
  });
  const reports = (data ?? []).filter((report) => Date.parse(report.expiresAt) > now);

  return (
    <Card style={styles.card}>
      <AppText variant="heading">{t('reports.title')}</AppText>
      {reports.length === 0 ? (
        <AppText color="textMuted">{t('reports.none')}</AppText>
      ) : (
        reports.map((report) => <ReportCard key={report.id} report={report} locale={locale} />)
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
});
