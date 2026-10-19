import type { Locale } from './i18n';

/**
 * Montants en MILLIMES (1 dinar tunisien = 1000 millimes) : toujours des
 * entiers, pour éviter les erreurs d'arrondi des nombres à virgule.
 * Rien n'est payé dans l'app : ces montants sont indicatifs (louage) ou une
 * participation aux frais réglée de la main à la main (covoiturage).
 */

/** 3500 → « 3,500 DT » (« 3,500 د.ت » en arabe), avec les trois décimales d'usage. */
export function formatMillimes(millimes: number, locale: Locale): string {
  const value = Math.max(0, Math.round(millimes));
  const amount = `${Math.floor(value / 1000)},${String(value % 1000).padStart(3, '0')}`;
  return locale === 'ar' ? `${amount} د.ت` : `${amount} DT`;
}
