import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

/** Carte en direct : arrive en phase 5 (arrêts proches, prochains bus). */
export default function MapScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <EmptyState
        icon="map-outline"
        title={t('common.comingSoon')}
        message={t('map.placeholder')}
      />
    </Screen>
  );
}
