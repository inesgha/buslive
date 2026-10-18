/**
 * Calculs d'horaires, partagés entre l'API et l'app mobile (horaires hors ligne).
 *
 * Conventions :
 * - une heure est stockée en MINUTES DEPUIS MINUIT, heure de Tunis (450 = 07:30) ;
 *   une valeur ≥ 1440 désigne un départ après minuit, rattaché à la journée de service précédente ;
 * - une date est une chaîne « AAAA-MM-JJ » (jour de service à Tunis), sans fuseau.
 */

export const MINUTES_PER_DAY = 24 * 60;

/** « 07:30 » → 450. Accepte jusqu'à « 47:59 » (départs après minuit). */
export function timeToMinutes(time: string): number {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(time);
  if (!match) throw new Error(`Heure invalide : « ${time} » (format attendu HH:MM).`);
  const hours = Number(match[1]);
  if (hours > 47) throw new Error(`Heure invalide : « ${time} ».`);
  return hours * 60 + Number(match[2]);
}

/** 450 → « 07:30 » ; 1470 → « 00:30 » (affichage sur 24 h). */
export function minutesToTime(minutes: number): string {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  return `${String(hours).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

/** Heure de passage à un arrêt : départ du terminus + temps de trajet jusqu'à l'arrêt. */
export function passingMinutes(departureMinutes: number, minutesFromStart: number): number {
  return departureMinutes + minutesFromStart;
}

/** Jours de la semaine, dans l'ordre de Date.getUTCDay() (0 = dimanche). */
const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** « 2026-10-19 » → 'monday'. Calculé en UTC pour ne pas dépendre du fuseau de l'appareil. */
export function weekdayOf(isoDate: string): Weekday {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) throw new Error(`Date invalide : « ${isoDate} ».`);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] as Weekday;
}

/** Règles d'un calendrier de service (sous-ensemble de ServiceCalendar). */
export type CalendarRule = Record<Weekday, boolean> & {
  code: string;
  /** « AAAA-MM-JJ » inclus, ou null = sans limite. */
  startDate: string | null;
  endDate: string | null;
  priority: number;
};

/** Le calendrier circule-t-il ce jour-là (jour de la semaine + période de validité) ? */
export function isCalendarActiveOn(calendar: CalendarRule, isoDate: string): boolean {
  if (calendar.startDate && isoDate < calendar.startDate) return false;
  if (calendar.endDate && isoDate > calendar.endDate) return false;
  return calendar[weekdayOf(isoDate)];
}

/**
 * Départs d'UN sens pour une date donnée, triés.
 *
 * Parmi les calendriers actifs ce jour-là ET ayant des départs pour ce sens, on
 * garde ceux de plus haute priorité. Exemple : un jour de semaine pendant le
 * Ramadan, si la ligne a des horaires « Ramadan » (priorité 10), ils remplacent
 * les horaires « Semaine » (priorité 0) ; sinon les horaires « Semaine » restent.
 */
export function departuresForDate(
  departures: readonly { calendarCode: string; departureMinutes: number }[],
  calendars: readonly CalendarRule[],
  isoDate: string,
): number[] {
  const usedCodes = new Set(departures.map((departure) => departure.calendarCode));
  const active = calendars.filter(
    (calendar) => usedCodes.has(calendar.code) && isCalendarActiveOn(calendar, isoDate),
  );
  if (active.length === 0) return [];

  const topPriority = Math.max(...active.map((calendar) => calendar.priority));
  const selected = new Set(
    active.filter((calendar) => calendar.priority === topPriority).map((c) => c.code),
  );

  const minutes = departures
    .filter((departure) => selected.has(departure.calendarCode))
    .map((departure) => departure.departureMinutes);
  return [...new Set(minutes)].sort((a, b) => a - b);
}
