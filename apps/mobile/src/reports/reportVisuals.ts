import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ReportType } from '@buslive/shared';
import type { ComponentProps } from 'react';

import type { ThemeColors } from '@/theme/tokens';

/**
 * Icône et couleur de chaque type de signalement (couleurs de statut de la
 * maquette : « pas venu » en rouge, « retard » en orange).
 */
export const REPORT_VISUALS: Record<
  ReportType,
  { icon: ComponentProps<typeof Ionicons>['name']; color: keyof ThemeColors }
> = {
  NOT_CAME: { icon: 'close-circle', color: 'notCame' },
  PASSED: { icon: 'play-skip-forward', color: 'text' },
  FULL: { icon: 'people', color: 'delay' },
  DELAYED: { icon: 'time', color: 'delay' },
  BREAKDOWN: { icon: 'construct', color: 'notCame' },
  STOP_MOVED: { icon: 'location', color: 'text' },
};
