import type { Locale } from '@buslive/shared';
import type { TFunction } from 'i18next';

import { ApiError } from '@/api/errors';

/**
 * Message d'erreur d'une action de covoiturage. Les messages de l'API sont
 * précis (« plus assez de places »…) mais rédigés en français : en arabe, on
 * affiche un message traduit plus général.
 */
export function rideErrorMessage(error: unknown, t: TFunction, locale: Locale): string {
  if (error instanceof ApiError) {
    if (error.status === 400 && error.message.includes('téléphone'))
      return t('rides.phoneRequired');
    if (locale === 'fr') return error.message;
  }
  return t('rides.error');
}
