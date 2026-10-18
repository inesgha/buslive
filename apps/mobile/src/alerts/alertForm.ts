import {
  type Alert,
  ALERT_RULES,
  type AlertInput,
  AlertInputSchema,
  MINUTES_PER_DAY,
  minutesToTime,
  type ServiceClock,
} from '@buslive/shared';

/**
 * Logique du formulaire d'alerte, sans interface (testable) : valeurs par
 * défaut, réglage des heures et des jours, construction de la requête.
 */

export interface AlertDraft {
  lineId?: string;
  directionId?: string;
  leadMinutes: number;
  days: number[];
  startMinutes: number;
  endMinutes: number;
  notifyApproach: boolean;
  notifyIncidents: boolean;
  enabled: boolean;
}

/** Les heures se règlent par quart d'heure. */
export const TIME_STEP_MINUTES = 15;
/** Plage proposée par défaut : 2 h à partir du quart d'heure en cours. */
const DEFAULT_WINDOW_MINUTES = 120;
/** Du lundi au samedi : beaucoup travaillent ou étudient le samedi matin. */
const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6];

export function defaultAlertDraft(clock: ServiceClock): AlertDraft {
  const start = Math.min(
    Math.floor(clock.minutes / TIME_STEP_MINUTES) * TIME_STEP_MINUTES,
    MINUTES_PER_DAY - DEFAULT_WINDOW_MINUTES,
  );
  return {
    leadMinutes: ALERT_RULES.defaultLeadMinutes,
    days: DEFAULT_DAYS,
    startMinutes: start,
    endMinutes: start + DEFAULT_WINDOW_MINUTES,
    notifyApproach: true,
    notifyIncidents: true,
    enabled: true,
  };
}

export function draftFromAlert(alert: Alert): AlertDraft {
  return {
    lineId: alert.line.id,
    directionId: alert.direction.id,
    leadMinutes: alert.leadMinutes,
    days: alert.days,
    startMinutes: alert.startMinutes,
    endMinutes: alert.endMinutes,
    notifyApproach: alert.notifyApproach,
    notifyIncidents: alert.notifyIncidents,
    enabled: alert.enabled,
  };
}

/**
 * Avance ou recule le début (ou la fin) d'un quart d'heure, en gardant au
 * moins un quart d'heure entre les deux.
 */
export function shiftTime(
  draft: AlertDraft,
  edge: 'startMinutes' | 'endMinutes',
  steps: number,
): AlertDraft {
  const value = draft[edge] + steps * TIME_STEP_MINUTES;
  if (edge === 'startMinutes') {
    const start = Math.max(0, Math.min(value, draft.endMinutes - TIME_STEP_MINUTES));
    return { ...draft, startMinutes: start };
  }
  const end = Math.min(MINUTES_PER_DAY, Math.max(value, draft.startMinutes + TIME_STEP_MINUTES));
  return { ...draft, endMinutes: end };
}

/** Coche ou décoche un jour (liste gardée triée). */
export function toggleDay(days: readonly number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
}

/** Brouillon → corps de la requête, ou null s'il manque quelque chose. */
export function buildAlertInput(draft: AlertDraft, stopId: string | undefined): AlertInput | null {
  const parsed = AlertInputSchema.safeParse({ ...draft, stopId });
  return parsed.success ? parsed.data : null;
}

/** Résumé des jours : « Tous les jours », « Du lundi au vendredi »… (clé i18n) ou null. */
export function daysPreset(
  days: readonly number[],
): 'everyDay' | 'weekdays' | 'mondayToSaturday' | 'weekend' | null {
  const key = [...days].sort((a, b) => a - b).join(',');
  switch (key) {
    case '1,2,3,4,5,6,7':
      return 'everyDay';
    case '1,2,3,4,5':
      return 'weekdays';
    case '1,2,3,4,5,6':
      return 'mondayToSaturday';
    case '6,7':
      return 'weekend';
    default:
      return null;
  }
}

/** Heure de fin : 1440 s'affiche « 24:00 » (et non « 00:00 », ambigu). */
export function formatWindowTime(minutes: number): string {
  return minutes >= MINUTES_PER_DAY ? '24:00' : minutesToTime(minutes);
}
