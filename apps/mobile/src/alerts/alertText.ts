import type { Alert, Locale } from '@buslive/shared';
import type { TFunction } from 'i18next';

import { daysPreset, formatWindowTime } from './alertForm';

/** Clés i18n des jours, dans l'ordre ISO (1 = lundi … 7 = dimanche). */
export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function weekdayKey(day: number): (typeof WEEKDAY_KEYS)[number] {
  return WEEKDAY_KEYS[day - 1] ?? 'mon';
}

/** « Du lundi au vendredi », ou « Lun, Mer, Ven » (virgule arabe en arabe). */
export function formatDays(days: readonly number[], t: TFunction, locale: Locale): string {
  const preset = daysPreset(days);
  if (preset) return t(`weekdays.presets.${preset}`);
  return days
    .map((day) => t(`weekdays.short.${weekdayKey(day)}`))
    .join(locale === 'ar' ? '، ' : ', ');
}

/** « Du lundi au vendredi · de 06:30 à 08:30 ». */
export function formatAlertSummary(
  alert: Pick<Alert, 'days' | 'startMinutes' | 'endMinutes'>,
  t: TFunction,
  locale: Locale,
): string {
  return t('alerts.summary', {
    days: formatDays(alert.days, t, locale),
    start: formatWindowTime(alert.startMinutes),
    end: formatWindowTime(alert.endMinutes),
  });
}
