import { addDays, minutesToTime, minutesUntil, type ServiceClock } from '@buslive/shared';
import type { TFunction } from 'i18next';

/**
 * Formatage des nombres avec les chiffres latins (0-9) dans les deux langues,
 * comme c'est l'usage en Tunisie, et la virgule décimale (« 1,2 km »).
 */
const decimal = new Intl.NumberFormat('fr', { maximumFractionDigits: 1 });

/** 347 → « 350 m » ; 999 → « 1 km » ; 1234 → « 1,2 km » (« م » / « كم » en arabe). */
export function formatDistance(meters: number, t: TFunction): string {
  // Arrondi à 10 m (la position GPS n'est pas plus précise), 10 m minimum.
  const rounded = Math.max(10, Math.round(meters / 10) * 10);
  if (rounded < 1000) return t('units.meters', { value: rounded });
  return t('units.kilometers', { value: decimal.format(rounded / 1000) });
}

/**
 * Heure d'un passage, pour l'affichage :
 * - moins d'une minute → « Maintenant »
 * - moins d'une heure → « dans 12 min »
 * - sinon → « à 14:30 » (ou « demain à 06:30 »).
 * Calculé à partir de l'heure ABSOLUE du passage : reste juste hors ligne.
 */
export function formatPassage(
  passage: { serviceDate: string; passingMinutes: number },
  clock: ServiceClock,
  t: TFunction,
): string {
  const remaining = minutesUntil(passage, clock);
  if (remaining < 1) return t('time.now');
  if (remaining < 60) return t('time.inMinutes', { count: remaining });

  // Un passage après minuit (ex. 24:30) a lieu le jour calendaire suivant.
  const calendarDate = addDays(passage.serviceDate, Math.floor(passage.passingMinutes / 1440));
  const time = minutesToTime(passage.passingMinutes);
  return calendarDate > clock.isoDate ? t('time.tomorrowAt', { time }) : t('time.at', { time });
}

/** Temps d'arrivée EN DIRECT : 0 → « Maintenant », 4 → « dans 4 min ». */
export function formatEta(etaMinutes: number, t: TFunction): string {
  return etaMinutes < 1 ? t('time.now') : t('time.inMinutes', { count: etaMinutes });
}
