import type { PrismaClient } from '../generated/prisma/client';
import type { ImportPlan } from './gtfs-plan';

export interface ImportSummary {
  operators: number;
  stops: { created: number; updated: number };
  calendars: { created: number; updated: number };
  lines: { created: number; updated: number };
  departures: number;
}

/**
 * Écrit un plan d'import GTFS dans la base, dans UNE transaction : en cas
 * d'erreur, rien n'est modifié. Idempotent (comme le seed) : chaque élément est
 * retrouvé par son code ; les arrêts d'un parcours et ses départs sont remplacés.
 * Avec dryRun, rien n'est écrit : seul le décompte (créés / mis à jour) est fait.
 */
export async function applyImportPlan(
  prisma: PrismaClient,
  plan: ImportPlan,
  options: { governorateCode: string; dryRun: boolean },
): Promise<ImportSummary> {
  const governorate = await prisma.governorate.findUnique({
    where: { code: options.governorateCode },
  });
  if (!governorate) throw new Error(`Gouvernorat inconnu : ${options.governorateCode}`);

  const existingStops = new Set(
    (
      await prisma.stop.findMany({
        where: { code: { in: plan.stops.map((s) => s.code) } },
        select: { code: true },
      })
    ).map((s) => s.code),
  );
  const existingCalendars = new Set(
    (
      await prisma.serviceCalendar.findMany({
        where: { code: { in: plan.calendars.map((c) => c.code) } },
        select: { code: true },
      })
    ).map((c) => c.code),
  );
  const existingLines = new Set(
    (
      await prisma.line.findMany({
        where: { governorateId: governorate.id, code: { in: plan.lines.map((l) => l.code) } },
        select: { code: true },
      })
    ).map((l) => l.code),
  );
  const count = (codes: string[], existing: Set<string>) => ({
    created: codes.filter((code) => !existing.has(code)).length,
    updated: codes.filter((code) => existing.has(code)).length,
  });
  const summary: ImportSummary = {
    operators: plan.operators.length,
    stops: count(
      plan.stops.map((s) => s.code),
      existingStops,
    ),
    calendars: count(
      plan.calendars.map((c) => c.code),
      existingCalendars,
    ),
    lines: count(
      plan.lines.map((l) => l.code),
      existingLines,
    ),
    departures: plan.lines.reduce(
      (sum, line) => sum + line.directions.reduce((s, d) => s + d.departures.length, 0),
      0,
    ),
  };
  if (options.dryRun) return summary;

  await prisma.$transaction(
    async (tx) => {
      const operatorIds = new Map<string, string>();
      for (const operator of plan.operators) {
        const saved = await tx.operator.upsert({
          where: { code: operator.code },
          create: operator,
          update: { name: operator.name },
        });
        operatorIds.set(operator.code, saved.id);
      }

      const stopIds = new Map<string, string>();
      for (const stop of plan.stops) {
        // Le trigger « stops_set_location » calcule le point PostGIS.
        const data = {
          nameFr: stop.nameFr,
          nameAr: stop.nameAr,
          latitude: stop.latitude,
          longitude: stop.longitude,
          governorateId: governorate.id,
          status: 'ACTIVE' as const,
        };
        const saved = await tx.stop.upsert({
          where: { code: stop.code },
          create: { code: stop.code, ...data },
          update: data,
        });
        stopIds.set(stop.code, saved.id);
      }

      const calendarIds = new Map<string, string>();
      for (const calendar of plan.calendars) {
        const { code, startDate, endDate, ...days } = calendar;
        const data = {
          ...days,
          startDate: new Date(`${startDate}T00:00:00Z`),
          endDate: new Date(`${endDate}T00:00:00Z`),
          priority: 0,
        };
        const saved = await tx.serviceCalendar.upsert({
          where: { code },
          create: { code, ...data },
          update: data,
        });
        calendarIds.set(code, saved.id);
      }

      for (const line of plan.lines) {
        const data = {
          nameFr: line.nameFr,
          nameAr: line.nameAr,
          type: line.type,
          color: line.color,
          operatorId: line.operatorCode ? (operatorIds.get(line.operatorCode) ?? null) : null,
          status: 'ACTIVE' as const,
        };
        const savedLine = await tx.line.upsert({
          where: { governorateId_code: { governorateId: governorate.id, code: line.code } },
          create: { code: line.code, governorateId: governorate.id, ...data },
          update: data,
        });

        for (const direction of line.directions) {
          const savedDirection = await tx.lineDirection.upsert({
            where: { lineId_direction: { lineId: savedLine.id, direction: direction.direction } },
            create: {
              lineId: savedLine.id,
              direction: direction.direction,
              headsignFr: direction.headsignFr,
              headsignAr: direction.headsignAr,
            },
            update: { headsignFr: direction.headsignFr, headsignAr: direction.headsignAr },
          });
          await tx.lineStop.deleteMany({ where: { directionId: savedDirection.id } });
          await tx.departure.deleteMany({ where: { directionId: savedDirection.id } });
          await tx.lineStop.createMany({
            data: direction.stops.map((stop, index) => ({
              directionId: savedDirection.id,
              sequence: index + 1,
              stopId: stopIds.get(stop.stopCode)!,
              minutesFromStart: stop.minutesFromStart,
            })),
          });
          await tx.departure.createMany({
            data: direction.departures.map((departure) => ({
              directionId: savedDirection.id,
              calendarId: calendarIds.get(departure.calendarCode)!,
              departureMinutes: departure.departureMinutes,
            })),
          });

          if (direction.shape && direction.shape.length >= 2) {
            // Tracé de shapes.txt (PostGIS, en SQL brut : type non géré par Prisma).
            const wkt = `LINESTRING(${direction.shape.map((p) => `${p.longitude} ${p.latitude}`).join(', ')})`;
            await tx.$executeRaw`
              UPDATE line_directions SET shape = ST_GeogFromText(${`SRID=4326;${wkt}`})
              WHERE id = ${savedDirection.id}::uuid
            `;
          } else {
            // Sans tracé : lignes droites d'arrêt en arrêt (comme le seed).
            await tx.$executeRaw`
              UPDATE line_directions d
              SET shape = (
                SELECT ST_MakeLine(s.location::geometry ORDER BY ls.sequence)::geography
                FROM line_stops ls JOIN stops s ON s.id = ls.stop_id
                WHERE ls.direction_id = d.id
              )
              WHERE d.id = ${savedDirection.id}::uuid
            `;
          }
        }
      }
    },
    // Un réseau complet peut compter des milliers de départs.
    { timeout: 120_000, maxWait: 10_000 },
  );
  return summary;
}
