import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

/** Alertes et alternatives : arrivent en phases 8 et 9. */
export default function AlertsScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <EmptyState
        icon="notifications-outline"
        title={t('common.comingSoon')}
        message={t('alerts.placeholder')}
      />
    </Screen>
  );
}
