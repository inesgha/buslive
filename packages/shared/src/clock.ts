/**
 * Heure « de service » à Tunis : date AAAA-MM-JJ + minutes depuis minuit.
 * Les horaires sont exprimés en heure de Tunis, quel que soit le fuseau du
 * serveur (souvent UTC) ou du téléphone (un touriste peut garder son fuseau).
 */
export interface ServiceClock {
  isoDate: string;
  minutes: number;
}

export const TUNIS_TIME_ZONE = 'Africa/Tunis';

/** La Tunisie est à UTC+1 sans heure d'été depuis 2009 : repli si Intl est indisponible. */
const TUNIS_FALLBACK_OFFSET_MINUTES = 60;

/** Heure de Tunis à un instant donné (par défaut : maintenant). */
export function tunisClock(instant: Date = new Date()): ServiceClock {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TUNIS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
    const [year, month, day, hour, minute] = [
      part('year'),
      part('month'),
      part('day'),
      part('hour'),
      part('minute'),
    ];
    if (year && month && day && hour && minute) {
      return { isoDate: `${year}-${month}-${day}`, minutes: Number(hour) * 60 + Number(minute) };
    }
  } catch {
    // Intl sans données de fuseaux : on utilise le décalage fixe ci-dessous.
  }
  const shifted = new Date(instant.getTime() + TUNIS_FALLBACK_OFFSET_MINUTES * 60_000);
  return {
    isoDate: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** « 2026-10-19 » + n jours → « 2026-10-20 ». */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/** Position absolue en minutes (permet de comparer des heures de jours différents). */
export function absoluteMinutes(isoDate: string, minutes: number): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / 60_000 + minutes;
}

/** Minutes entre maintenant et un passage (négatif s'il est déjà passé). */
export function minutesUntil(
  passage: { serviceDate: string; passingMinutes: number },
  clock: ServiceClock,
): number {
  return (
    absoluteMinutes(passage.serviceDate, passage.passingMinutes) -
    absoluteMinutes(clock.isoDate, clock.minutes)
  );
}
