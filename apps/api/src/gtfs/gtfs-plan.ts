import type { GeoPoint, LineType } from '@buslive/shared';

import { readTable } from './csv';

/**
 * Conversion d'un flux GTFS (le format standard des réseaux de transport)
 * vers le modèle de BusLive. Fonctions PURES : aucune base de données ici,
 * tout est testable avec de simples textes.
 *
 * Correspondances :
 * - stops.txt → arrêts ; routes.txt → lignes ; agency.txt → exploitants ;
 * - calendar.txt → calendriers de service ;
 * - trips.txt + stop_times.txt → pour chaque ligne et chaque sens (direction_id
 *   0 = aller, 1 = retour) : l'ordre des arrêts, le temps de trajet jusqu'à
 *   chacun, et les heures de départ du terminus ;
 * - translations.txt (facultatif) → noms en arabe ; shapes.txt (facultatif) → tracés.
 *
 * Limite du modèle de BusLive : UN parcours par sens. Si les courses d'un même
 * sens n'ont pas toutes les mêmes arrêts, le parcours le plus fréquent est
 * retenu et les autres courses sont signalées (avertissement) puis ignorées.
 */

export class GtfsError extends Error {
  constructor(readonly problems: string[]) {
    super(`GTFS invalide :\n- ${problems.join('\n- ')}`);
    this.name = 'GtfsError';
  }
}

export interface GtfsOptions {
  /** Préfixe des codes (arrêts, calendriers), pour éviter les collisions entre réseaux. */
  prefix: string;
  /** GTFS ne distingue pas urbain / banlieue / interurbain : type donné à toutes les lignes. */
  lineType: LineType;
}

export interface PlanStop {
  code: string;
  nameFr: string;
  nameAr: string;
  latitude: number;
  longitude: number;
}

export interface PlanCalendar {
  code: string;
  nameFr: string;
  nameAr: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  startDate: string;
  endDate: string;
}

export interface PlanDirection {
  direction: 'OUTBOUND' | 'INBOUND';
  headsignFr: string;
  headsignAr: string;
  stops: { stopCode: string; minutesFromStart: number }[];
  departures: { calendarCode: string; departureMinutes: number }[];
  /** Tracé de shapes.txt, ou null (lignes droites entre arrêts). */
  shape: GeoPoint[] | null;
}

export interface PlanLine {
  code: string;
  nameFr: string;
  nameAr: string;
  color: string;
  type: LineType;
  operatorCode: string | null;
  directions: PlanDirection[];
}

export interface ImportPlan {
  operators: { code: string; name: string }[];
  stops: PlanStop[];
  calendars: PlanCalendar[];
  lines: PlanLine[];
  warnings: string[];
}

const REQUIRED_FILES = ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt'];
/** La Tunisie, avec une marge : une coordonnée hors de ce cadre est une erreur de saisie. */
const TUNISIA = { minLat: 30, maxLat: 38, minLng: 7, maxLng: 12 };
const DEFAULT_COLOR = '#0E7490';

/** « 07:30:00 » ou « 25:10:00 » (après minuit) → minutes depuis minuit. */
export function gtfsTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]) + Math.round(Number(match[3]) / 60);
}

/** « 20261019 » → « 2026-10-19 ». */
function gtfsDate(value: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

export function buildImportPlan(files: Record<string, string>, options: GtfsOptions): ImportPlan {
  const problems: string[] = [];
  const warnings: string[] = [];
  for (const file of REQUIRED_FILES) {
    if (files[file] === undefined) problems.push(`fichier obligatoire absent : ${file}`);
  }
  if (problems.length > 0) throw new GtfsError(problems);
  if (files['calendar_dates.txt']) {
    warnings.push(
      'calendar_dates.txt ignoré : les exceptions de calendrier ne sont pas importées.',
    );
  }

  const table = (name: string) => readTable(files[name] ?? '');
  const translations = new Map<string, string>();
  for (const row of table('translations.txt')) {
    if (row.language?.toLowerCase().startsWith('ar') && row.record_id && row.translation) {
      translations.set(`${row.table_name}:${row.field_name}:${row.record_id}`, row.translation);
    }
  }
  const arabic = (tableName: string, field: string, id: string, fallback: string) =>
    translations.get(`${tableName}:${field}:${id}`) ?? fallback;

  // --- Arrêts --------------------------------------------------------------------------
  const stopCodes = new Map<string, string>();
  const stops: PlanStop[] = [];
  for (const row of table('stops.txt')) {
    const id = row.stop_id ?? '';
    if (row.location_type && row.location_type !== '0') continue; // gares, entrées : ignorées
    const latitude = Number(row.stop_lat);
    const longitude = Number(row.stop_lon);
    if (!id || !row.stop_name) {
      problems.push(`stops.txt : arrêt sans identifiant ou sans nom (${id || '?'})`);
      continue;
    }
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < TUNISIA.minLat ||
      latitude > TUNISIA.maxLat ||
      longitude < TUNISIA.minLng ||
      longitude > TUNISIA.maxLng
    ) {
      problems.push(`stops.txt : coordonnées hors de Tunisie pour l'arrêt ${id}`);
      continue;
    }
    const code = `${options.prefix}${id}`;
    stopCodes.set(id, code);
    stops.push({
      code,
      nameFr: row.stop_name,
      nameAr: arabic('stops', 'stop_name', id, row.stop_name),
      latitude,
      longitude,
    });
  }

  // --- Calendriers ---------------------------------------------------------------------
  const calendarCodes = new Map<string, string>();
  const calendars: PlanCalendar[] = [];
  for (const row of table('calendar.txt')) {
    const id = row.service_id ?? '';
    const startDate = gtfsDate(row.start_date ?? '');
    const endDate = gtfsDate(row.end_date ?? '');
    if (!id || !startDate || !endDate) {
      problems.push(`calendar.txt : calendrier invalide (${id || '?'})`);
      continue;
    }
    const code = `${options.prefix}${id}`;
    calendarCodes.set(id, code);
    const day = (name: string) => row[name] === '1';
    calendars.push({
      code,
      nameFr: id,
      nameAr: id,
      monday: day('monday'),
      tuesday: day('tuesday'),
      wednesday: day('wednesday'),
      thursday: day('thursday'),
      friday: day('friday'),
      saturday: day('saturday'),
      sunday: day('sunday'),
      startDate,
      endDate,
    });
  }

  // --- Tracés --------------------------------------------------------------------------
  const shapes = new Map<string, { seq: number; point: GeoPoint }[]>();
  for (const row of table('shapes.txt')) {
    const points = shapes.get(row.shape_id ?? '') ?? [];
    points.push({
      seq: Number(row.shape_pt_sequence),
      point: { latitude: Number(row.shape_pt_lat), longitude: Number(row.shape_pt_lon) },
    });
    shapes.set(row.shape_id ?? '', points);
  }

  // --- Horaires des courses -----------------------------------------------------------
  const stopTimes = new Map<string, { seq: number; stopId: string; minutes: number | null }[]>();
  for (const row of table('stop_times.txt')) {
    const list = stopTimes.get(row.trip_id ?? '') ?? [];
    list.push({
      seq: Number(row.stop_sequence),
      stopId: row.stop_id ?? '',
      minutes: gtfsTimeToMinutes(row.departure_time || row.arrival_time || ''),
    });
    stopTimes.set(row.trip_id ?? '', list);
  }

  // --- Lignes et sens -------------------------------------------------------------------
  const tripsByGroup = new Map<string, Record<string, string>[]>();
  for (const trip of table('trips.txt')) {
    const key = `${trip.route_id}|${trip.direction_id === '1' ? '1' : '0'}`;
    tripsByGroup.set(key, [...(tripsByGroup.get(key) ?? []), trip]);
  }

  const agencies = table('agency.txt');
  const operators = agencies.map((agency) => ({
    code: `${options.prefix}${agency.agency_id || 'agence'}`,
    name: agency.agency_name || agency.agency_id || 'Exploitant',
  }));

  const lines: PlanLine[] = [];
  for (const route of table('routes.txt')) {
    const routeId = route.route_id ?? '';
    const code = route.route_short_name || routeId;
    const nameFr = route.route_long_name || code;
    const color = /^[0-9A-Fa-f]{6}$/.test(route.route_color ?? '')
      ? `#${route.route_color!.toUpperCase()}`
      : DEFAULT_COLOR;
    const directions: PlanDirection[] = [];

    for (const directionId of ['0', '1'] as const) {
      const trips = tripsByGroup.get(`${routeId}|${directionId}`) ?? [];
      if (trips.length === 0) continue;
      const timed = trips.flatMap((trip) => {
        const times = (stopTimes.get(trip.trip_id ?? '') ?? []).sort((a, b) => a.seq - b.seq);
        if (times.length < 2) {
          warnings.push(`course ${trip.trip_id} ignorée : moins de deux arrêts.`);
          return [];
        }
        const missing = times.find((t) => t.minutes === null);
        if (missing) {
          problems.push(
            `stop_times.txt : heure manquante ou invalide (course ${trip.trip_id}, arrêt ${missing.stopId}) — l'interpolation n'est pas prise en charge`,
          );
          return [];
        }
        const unknown = times.find((t) => !stopCodes.has(t.stopId));
        if (unknown) {
          problems.push(
            `stop_times.txt : arrêt inconnu ${unknown.stopId} (course ${trip.trip_id})`,
          );
          return [];
        }
        if (!calendarCodes.has(trip.service_id ?? '')) {
          problems.push(
            `trips.txt : calendrier inconnu ${trip.service_id} (course ${trip.trip_id})`,
          );
          return [];
        }
        return [{ trip, times: times as { seq: number; stopId: string; minutes: number }[] }];
      });
      if (timed.length === 0) continue;

      // Parcours retenu : le plus fréquent (à égalité, le plus long).
      const byPattern = new Map<string, typeof timed>();
      for (const item of timed) {
        const pattern = item.times.map((t) => t.stopId).join('>');
        byPattern.set(pattern, [...(byPattern.get(pattern) ?? []), item]);
      }
      const [, canonical] = [...byPattern].sort(
        ([patternA, a], [patternB, b]) =>
          b.length - a.length || patternB.split('>').length - patternA.split('>').length,
      )[0]!;
      const skipped = timed.length - canonical.length;
      if (skipped > 0) {
        warnings.push(
          `ligne ${code}, sens ${directionId} : ${skipped} course(s) avec un autre parcours ignorée(s).`,
        );
      }

      const first = canonical[0]!;
      const stopsOfDirection = first.times.map((time, index) => ({
        stopCode: stopCodes.get(time.stopId)!,
        minutesFromStart: median(
          canonical.map((item) => item.times[index]!.minutes - item.times[0]!.minutes),
        ),
      }));
      // Temps de trajet croissants (une valeur aberrante ne peut pas « revenir en arrière »).
      for (let i = 1; i < stopsOfDirection.length; i++) {
        stopsOfDirection[i]!.minutesFromStart = Math.max(
          stopsOfDirection[i]!.minutesFromStart,
          stopsOfDirection[i - 1]!.minutesFromStart,
        );
      }

      const departures = new Map<string, { calendarCode: string; departureMinutes: number }>();
      for (const item of canonical) {
        const calendarCode = calendarCodes.get(item.trip.service_id ?? '')!;
        const departureMinutes = item.times[0]!.minutes;
        departures.set(`${calendarCode}|${departureMinutes}`, { calendarCode, departureMinutes });
      }

      const lastStop = stops.find((s) => s.code === stopsOfDirection.at(-1)?.stopCode);
      const headsign = first.trip.trip_headsign || lastStop?.nameFr || code;
      const headsignAr = first.trip.trip_headsign
        ? arabic('trips', 'trip_headsign', first.trip.trip_id ?? '', first.trip.trip_headsign)
        : (lastStop?.nameAr ?? headsign);
      const shapePoints = shapes.get(first.trip.shape_id ?? '');

      directions.push({
        direction: directionId === '0' ? 'OUTBOUND' : 'INBOUND',
        // Convention de BusLive : la destination affichée commence par « vers » / « نحو ».
        headsignFr: `vers ${headsign}`,
        headsignAr: `نحو ${headsignAr}`,
        stops: stopsOfDirection,
        departures: [...departures.values()].sort(
          (a, b) => a.departureMinutes - b.departureMinutes,
        ),
        shape: shapePoints ? shapePoints.sort((a, b) => a.seq - b.seq).map((p) => p.point) : null,
      });
    }

    if (directions.length === 0) {
      warnings.push(`ligne ${code} ignorée : aucune course utilisable.`);
      continue;
    }
    lines.push({
      code,
      nameFr,
      nameAr: arabic('routes', 'route_long_name', routeId, nameFr),
      color,
      type: options.lineType,
      operatorCode: route.agency_id
        ? `${options.prefix}${route.agency_id}`
        : (operators[0]?.code ?? null),
      directions,
    });
  }

  if (problems.length > 0) throw new GtfsError(problems);
  // Seuls les arrêts réellement desservis sont importés.
  const used = new Set(
    lines.flatMap((l) => l.directions.flatMap((d) => d.stops.map((s) => s.stopCode))),
  );
  const unused = stops.filter((stop) => !used.has(stop.code)).length;
  if (unused > 0)
    warnings.push(`${unused} arrêt(s) desservi(s) par aucune course : non importé(s).`);

  return {
    operators,
    stops: stops.filter((stop) => used.has(stop.code)),
    calendars: calendars.filter((calendar) =>
      lines.some((l) =>
        l.directions.some((d) => d.departures.some((dep) => dep.calendarCode === calendar.code)),
      ),
    ),
    lines,
    warnings,
  };
}
