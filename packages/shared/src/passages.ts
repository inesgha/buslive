import { absoluteMinutes, addDays, type ServiceClock } from './clock';
import { type CalendarRule, departuresForDate, passingMinutes } from './schedule';

/**
 * Un sens de ligne qui dessert l'arrêt étudié : ses départs du terminus et le
 * temps de trajet jusqu'à l'arrêt. « key » est libre (identifiants à retrouver
 * dans le résultat).
 */
export interface PassageSource<K> {
  key: K;
  minutesFromStart: number;
  departures: readonly { calendarCode: string; departureMinutes: number }[];
}

export interface UpcomingPassage<K> {
  key: K;
  /** Journée de service du départ (un bus après minuit appartient à la veille). */
  serviceDate: string;
  /** Heure de passage à l'arrêt, en minutes depuis minuit de la journée de service. */
  passingMinutes: number;
}

export interface UpcomingOptions {
  /** Fenêtre de recherche à partir de maintenant (défaut : 24 h). */
  horizonMinutes?: number;
  /** Nombre maximal de passages renvoyés (défaut : tous). */
  limit?: number;
}

/**
 * Prochains passages à un arrêt, tous sens confondus, triés par heure.
 *
 * On regarde trois journées de service : la veille (bus partis après minuit,
 * ex. 24:30 = 00:30 aujourd'hui), aujourd'hui et demain (si la fenêtre déborde
 * après minuit). Pour chacune, les départs viennent du calendrier qui s'applique
 * ce jour-là (voir departuresForDate, Ramadan compris).
 */
export function upcomingPassages<K>(
  sources: readonly PassageSource<K>[],
  calendars: readonly CalendarRule[],
  clock: ServiceClock,
  { horizonMinutes = 24 * 60, limit }: UpcomingOptions = {},
): UpcomingPassage<K>[] {
  const now = absoluteMinutes(clock.isoDate, clock.minutes);
  const serviceDates = [addDays(clock.isoDate, -1), clock.isoDate, addDays(clock.isoDate, 1)];

  const passages: (UpcomingPassage<K> & { at: number })[] = [];
  for (const source of sources) {
    for (const serviceDate of serviceDates) {
      for (const departure of departuresForDate(source.departures, calendars, serviceDate)) {
        const minutes = passingMinutes(departure, source.minutesFromStart);
        const at = absoluteMinutes(serviceDate, minutes);
        if (at >= now && at <= now + horizonMinutes) {
          passages.push({ key: source.key, serviceDate, passingMinutes: minutes, at });
        }
      }
    }
  }

  passages.sort((a, b) => a.at - b.at);
  const selected = limit === undefined ? passages : passages.slice(0, limit);
  return selected.map(({ key, serviceDate, passingMinutes: minutes }) => ({
    key,
    serviceDate,
    passingMinutes: minutes,
  }));
}
