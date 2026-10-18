import {
  type NearbyStop,
  type NearbyStopsQuery,
  type StopDepartures,
  tunisClock,
  upcomingPassages,
} from '@buslive/shared';
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { LiveService } from '../live/live.service';
import { ReportsService } from '../reports/reports.service';
import { VISIBLE_STOP } from './network.filters';
import { compareLineCodes, toDirectionSummary, toServiceCalendar } from './network.mapper';

interface NearbyRow {
  id: string;
  code: string;
  name_fr: string;
  name_ar: string;
  latitude: number;
  longitude: number;
  locality_code: string | null;
  locality_name_fr: string | null;
  locality_name_ar: string | null;
  distance: number;
}

/** Arrêts proches et prochains passages (écran Carte). */
@Injectable()
export class StopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly live: LiveService,
    private readonly reports: ReportsService,
  ) {}

  /**
   * Arrêts actifs dans un rayon autour d'un point, du plus proche au plus loin.
   * - ST_DWithin filtre en s'appuyant sur l'index spatial GIST de stops.location ;
   * - « <-> » trie par distance (recherche « plus proches voisins » via l'index).
   * La position reçue n'est ni stockée ni journalisée.
   */
  async findNearby({ lat, lng, radius, limit }: NearbyStopsQuery): Promise<NearbyStop[]> {
    const rows = await this.prisma.$queryRaw<NearbyRow[]>`
      WITH here AS (
        SELECT ST_SetSRID(
          ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326
        )::geography AS point
      )
      SELECT s.id, s.code, s.name_fr, s.name_ar, s.latitude, s.longitude,
             l.code AS locality_code, l.name_fr AS locality_name_fr, l.name_ar AS locality_name_ar,
             ST_Distance(s.location, here.point) AS distance
      FROM stops s
      CROSS JOIN here
      JOIN governorates g ON g.id = s.governorate_id AND g.is_active
      LEFT JOIN localities l ON l.id = s.locality_id
      WHERE s.status = 'ACTIVE'
        AND ST_DWithin(s.location, here.point, ${radius}::double precision)
      ORDER BY s.location <-> here.point
      LIMIT ${limit}::int
    `;
    if (rows.length === 0) return [];

    // Lignes actives desservant ces arrêts (une pastille par ligne).
    const lineStops = await this.prisma.lineStop.findMany({
      where: {
        stopId: { in: rows.map((row) => row.id) },
        direction: { line: { status: 'ACTIVE' } },
      },
      select: {
        stopId: true,
        direction: { select: { line: { select: { id: true, code: true, color: true } } } },
      },
    });
    const linesByStop = new Map<string, Map<string, NearbyStop['lines'][number]>>();
    for (const { stopId, direction } of lineStops) {
      const lines = linesByStop.get(stopId) ?? new Map();
      lines.set(direction.line.id, direction.line);
      linesByStop.set(stopId, lines);
    }

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      nameFr: row.name_fr,
      nameAr: row.name_ar,
      latitude: row.latitude,
      longitude: row.longitude,
      locality:
        row.locality_code && row.locality_name_fr && row.locality_name_ar
          ? { code: row.locality_code, nameFr: row.locality_name_fr, nameAr: row.locality_name_ar }
          : null,
      distanceMeters: Math.round(row.distance),
      lines: [...(linesByStop.get(row.id)?.values() ?? [])].sort((a, b) =>
        compareLineCodes(a.code, b.code),
      ),
    }));
  }

  /**
   * Prochains passages à un arrêt (24 h à venir), toutes lignes et tous sens.
   * Le calcul est fait par upcomingPassages (@buslive/shared), le même que
   * celui de l'app hors ligne.
   */
  async getDepartures(
    stopId: string,
    at: Date,
    limit: number,
    viewerId?: string,
  ): Promise<StopDepartures> {
    const stop = await this.prisma.stop.findFirst({
      where: { id: stopId, ...VISIBLE_STOP },
      select: {
        id: true,
        lineStops: {
          where: { direction: { line: { status: 'ACTIVE' } } },
          select: {
            minutesFromStart: true,
            direction: {
              include: {
                line: { select: { id: true, code: true, color: true, nameFr: true, nameAr: true } },
                departures: { include: { calendar: true } },
              },
            },
          },
        },
      },
    });
    if (!stop) throw new NotFoundException('Arrêt introuvable.');

    // Calendriers utilisés par ces départs (dédoublonnés par code).
    const calendars = new Map(
      stop.lineStops.flatMap(({ direction }) =>
        direction.departures.map(
          (departure) => [departure.calendar.code, departure.calendar] as const,
        ),
      ),
    );

    const passages = upcomingPassages(
      stop.lineStops.map(({ minutesFromStart, direction }) => ({
        key: direction,
        minutesFromStart,
        departures: direction.departures.map((departure) => ({
          calendarCode: departure.calendar.code,
          departureMinutes: departure.departureMinutes,
        })),
      })),
      [...calendars.values()].map(toServiceCalendar),
      tunisClock(at),
      { limit },
    );

    // Bus en direct qui approchent (toujours calculés à l'instant présent, même
    // si « at » est fourni pour les horaires).
    const liveArrivals = this.live.arrivalsAtStop(
      stop.lineStops.map(({ minutesFromStart, direction }) => ({
        lineId: direction.line.id,
        directionId: direction.id,
        minutesFromStart,
        line: direction.line,
        direction: toDirectionSummary(direction),
      })),
    );

    // Signalements de l'arrêt (et « plein » / « panne » des sens qui le desservent).
    const reports = await this.reports.listForStop(
      stop.id,
      stop.lineStops.map(({ direction }) => direction.id),
      viewerId,
    );

    return {
      stopId: stop.id,
      generatedAt: at.toISOString(),
      liveArrivals,
      reports,
      passages: passages.map(({ key: direction, serviceDate, passingMinutes }) => ({
        line: direction.line,
        direction: toDirectionSummary(direction),
        serviceDate,
        passingMinutes,
      })),
    };
  }
}
