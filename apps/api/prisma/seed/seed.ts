import type { PrismaClient } from '../../src/generated/prisma/client';
import { GOVERNORATES } from './data/governorates';
import { DEMO_LOUAGE_LOCALITIES, DEMO_LOUAGE_STATIONS } from './data/louage-demo';
import {
  DEMO_CALENDARS,
  DEMO_LINES,
  DEMO_LOCALITIES,
  DEMO_OPERATOR,
  DEMO_STOPS,
} from './data/mahdia-demo';
import type { CalendarData, DeparturesByCalendar } from './types';

export interface SeedOptions {
  /** Inclure le réseau de démonstration (jamais en production). */
  demo: boolean;
}

export interface SeedSummary {
  governorates: number;
  localities: number;
  stops: number;
  calendars: number;
  lines: number;
  departures: number;
  louageStations: number;
  louageRoutes: number;
}

/**
 * Remplit la base. IDEMPOTENT : chaque élément est retrouvé par un code stable
 * (upsert), on peut donc relancer le seed sans créer de doublons.
 * Les arrêts d'un parcours et ses départs sont remplacés à chaque exécution.
 */
export async function seed(prisma: PrismaClient, options: SeedOptions): Promise<SeedSummary> {
  for (const governorate of GOVERNORATES) {
    await prisma.governorate.upsert({
      where: { code: governorate.code },
      // isActive n'est fixé qu'à la création : on ne réécrase pas une activation
      // faite plus tard (par un administrateur, par exemple).
      create: governorate,
      update: { nameFr: governorate.nameFr, nameAr: governorate.nameAr },
    });
  }

  const summary: SeedSummary = {
    governorates: GOVERNORATES.length,
    localities: 0,
    stops: 0,
    calendars: 0,
    lines: 0,
    departures: 0,
    louageStations: 0,
    louageRoutes: 0,
  };
  if (!options.demo) return summary;

  const governorateIds = await idsByCode(prisma.governorate.findMany());

  const operator = await prisma.operator.upsert({
    where: { code: DEMO_OPERATOR.code },
    create: DEMO_OPERATOR,
    update: { name: DEMO_OPERATOR.name },
  });

  for (const locality of [...DEMO_LOCALITIES, ...DEMO_LOUAGE_LOCALITIES]) {
    const data = {
      nameFr: locality.nameFr,
      nameAr: locality.nameAr,
      governorateId: required(governorateIds, locality.governorateCode),
    };
    await prisma.locality.upsert({
      where: { code: locality.code },
      create: { code: locality.code, ...data },
      update: data,
    });
  }
  const localities = await prisma.locality.findMany();
  const localityById = new Map(localities.map((l) => [l.code, l]));

  for (const stop of DEMO_STOPS) {
    const locality = localityById.get(stop.localityCode);
    if (!locality) throw new Error(`Localité inconnue : ${stop.localityCode}`);
    const data = {
      nameFr: stop.nameFr,
      nameAr: stop.nameAr,
      latitude: stop.latitude,
      longitude: stop.longitude,
      governorateId: locality.governorateId,
      localityId: locality.id,
      status: 'ACTIVE' as const,
    };
    // « location » (PostGIS) est calculé par le trigger stops_set_location.
    await prisma.stop.upsert({
      where: { code: stop.code },
      create: { code: stop.code, ...data },
      update: data,
    });
  }
  const stopIds = await idsByCode(prisma.stop.findMany());

  for (const calendar of DEMO_CALENDARS) {
    const data = calendarFields(calendar);
    await prisma.serviceCalendar.upsert({
      where: { code: calendar.code },
      create: { code: calendar.code, ...data },
      update: data,
    });
  }
  const calendarIds = await idsByCode(prisma.serviceCalendar.findMany());

  const mahdiaId = required(governorateIds, 'TN-53');
  for (const line of DEMO_LINES) {
    const lineData = {
      nameFr: line.nameFr,
      nameAr: line.nameAr,
      type: line.type,
      color: line.color,
      operatorId: operator.id,
      status: 'ACTIVE' as const,
    };
    const savedLine = await prisma.line.upsert({
      where: { governorateId_code: { governorateId: mahdiaId, code: line.code } },
      create: { code: line.code, governorateId: mahdiaId, ...lineData },
      update: lineData,
    });

    // Le retour parcourt les arrêts en sens inverse : temps = durée totale − temps aller.
    const outboundStops = line.outbound.stops;
    const totalMinutes = outboundStops.at(-1)?.[1] ?? 0;
    const inboundStops = [...outboundStops]
      .reverse()
      .map(([code, minutes]) => [code, totalMinutes - minutes] as [string, number]);

    const directions = [
      { direction: 'OUTBOUND' as const, ...line.outbound, stops: outboundStops },
      { direction: 'INBOUND' as const, ...line.inbound, stops: inboundStops },
    ];

    for (const direction of directions) {
      const savedDirection = await prisma.lineDirection.upsert({
        where: { lineId_direction: { lineId: savedLine.id, direction: direction.direction } },
        create: {
          lineId: savedLine.id,
          direction: direction.direction,
          headsignFr: direction.headsignFr,
          headsignAr: direction.headsignAr,
        },
        update: { headsignFr: direction.headsignFr, headsignAr: direction.headsignAr },
      });

      const departures = flattenDepartures(direction.departures, calendarIds);
      await prisma.$transaction([
        prisma.lineStop.deleteMany({ where: { directionId: savedDirection.id } }),
        prisma.departure.deleteMany({ where: { directionId: savedDirection.id } }),
        prisma.lineStop.createMany({
          data: direction.stops.map(([stopCode, minutesFromStart], index) => ({
            directionId: savedDirection.id,
            sequence: index + 1,
            stopId: required(stopIds, stopCode),
            minutesFromStart,
          })),
        }),
        prisma.departure.createMany({
          data: departures.map((departure) => ({ directionId: savedDirection.id, ...departure })),
        }),
      ]);
      summary.departures += departures.length;

      // Tracé approximatif : ligne droite d'arrêt en arrêt, dans l'ordre du parcours.
      // (À remplacer plus tard par le vrai tracé routier, ex. depuis OpenStreetMap.)
      await prisma.$executeRaw`
        UPDATE line_directions d
        SET shape = (
          SELECT ST_MakeLine(s.location::geometry ORDER BY ls.sequence)::geography
          FROM line_stops ls
          JOIN stops s ON s.id = ls.stop_id
          WHERE ls.direction_id = d.id
        )
        WHERE d.id = ${savedDirection.id}::uuid
      `;
    }
  }

  // Louages (phase 9) : stations et destinations, retrouvées par leur code.
  for (const station of DEMO_LOUAGE_STATIONS) {
    const locality = localityById.get(station.localityCode);
    if (!locality) throw new Error(`Localité inconnue : ${station.localityCode}`);
    const data = {
      nameFr: station.nameFr,
      nameAr: station.nameAr,
      latitude: station.latitude,
      longitude: station.longitude,
      openingMinutes: station.openingMinutes,
      closingMinutes: station.closingMinutes,
      governorateId: locality.governorateId,
      localityId: locality.id,
      status: 'ACTIVE' as const,
    };
    const saved = await prisma.louageStation.upsert({
      where: { code: station.code },
      create: { code: station.code, ...data },
      update: data,
    });
    for (const [destinationCode, priceMillimes, durationMinutes] of station.routes) {
      const destination = localityById.get(destinationCode);
      if (!destination) throw new Error(`Localité inconnue : ${destinationCode}`);
      await prisma.louageRoute.upsert({
        where: {
          stationId_destinationLocalityId: {
            stationId: saved.id,
            destinationLocalityId: destination.id,
          },
        },
        create: {
          stationId: saved.id,
          destinationLocalityId: destination.id,
          priceMillimes,
          durationMinutes,
        },
        update: { priceMillimes, durationMinutes },
      });
    }
  }

  return {
    ...summary,
    localities: DEMO_LOCALITIES.length + DEMO_LOUAGE_LOCALITIES.length,
    louageStations: DEMO_LOUAGE_STATIONS.length,
    louageRoutes: DEMO_LOUAGE_STATIONS.reduce((sum, station) => sum + station.routes.length, 0),
    stops: DEMO_STOPS.length,
    calendars: DEMO_CALENDARS.length,
    lines: DEMO_LINES.length,
  };
}

async function idsByCode(
  rows: Promise<{ id: string; code: string }[]>,
): Promise<Map<string, string>> {
  return new Map((await rows).map((row) => [row.code, row.id]));
}

function required(ids: Map<string, string>, code: string): string {
  const id = ids.get(code);
  if (!id) throw new Error(`Code inconnu dans les données du seed : « ${code} ».`);
  return id;
}

function calendarFields(calendar: CalendarData) {
  const day = (name: CalendarData['days'][number]) => calendar.days.includes(name);
  return {
    nameFr: calendar.nameFr,
    nameAr: calendar.nameAr,
    monday: day('monday'),
    tuesday: day('tuesday'),
    wednesday: day('wednesday'),
    thursday: day('thursday'),
    friday: day('friday'),
    saturday: day('saturday'),
    sunday: day('sunday'),
    startDate: calendar.startDate ? new Date(`${calendar.startDate}T00:00:00Z`) : null,
    endDate: calendar.endDate ? new Date(`${calendar.endDate}T00:00:00Z`) : null,
    priority: calendar.priority,
  };
}

function flattenDepartures(
  byCalendar: DeparturesByCalendar,
  calendarIds: Map<string, string>,
): { calendarId: string; departureMinutes: number }[] {
  return Object.entries(byCalendar).flatMap(([calendarCode, minutes]) =>
    minutes.map((departureMinutes) => ({
      calendarId: required(calendarIds, calendarCode),
      departureMinutes,
    })),
  );
}
