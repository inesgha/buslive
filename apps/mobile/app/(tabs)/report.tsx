import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

/** Signaler : arrive en phase 7 (pas venu, plein, retard, panne…). */
export default function ReportScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <EmptyState
        icon="megaphone-outline"
        title={t('common.comingSoon')}
        message={t('report.placeholder')}
      />
    </Screen>
  );
}
