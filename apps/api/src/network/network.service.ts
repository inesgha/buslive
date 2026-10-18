import type { Governorate, LineDetail, LineSummary, StopDetail } from '@buslive/shared';
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ACTIVE_GOVERNORATE, VISIBLE_LINE, VISIBLE_STOP } from './network.filters';
import {
  compareLineCodes,
  toDirectionSummary,
  toGeoPoints,
  toGovernorate,
  toLineSummary,
  toServiceCalendar,
  toStopSummary,
} from './network.mapper';

@Injectable()
export class NetworkService {
  constructor(private readonly prisma: PrismaService) {}

  async listGovernorates(): Promise<Governorate[]> {
    const governorates = await this.prisma.governorate.findMany({
      where: ACTIVE_GOVERNORATE,
      orderBy: { nameFr: 'asc' },
    });
    return governorates.map(toGovernorate);
  }

  async listLines(governorateCode?: string): Promise<LineSummary[]> {
    const lines = await this.prisma.line.findMany({
      where: {
        ...VISIBLE_LINE,
        governorate: { ...ACTIVE_GOVERNORATE, ...(governorateCode && { code: governorateCode }) },
      },
      include: {
        operator: true,
        governorate: true,
        directions: { orderBy: { direction: 'asc' } },
      },
    });

    return lines.sort((a, b) => compareLineCodes(a.code, b.code)).map(toLineSummary);
  }

  /** Détail complet d'une ligne : de quoi calculer ses horaires sans réseau. */
  async getLine(id: string): Promise<LineDetail> {
    const line = await this.prisma.line.findFirst({
      where: { id, ...VISIBLE_LINE },
      include: {
        operator: true,
        governorate: true,
        directions: {
          orderBy: { direction: 'asc' },
          include: {
            stops: {
              // Un arrêt archivé ou en attente disparaît du parcours affiché.
              where: { stop: { status: 'ACTIVE' } },
              orderBy: { sequence: 'asc' },
              include: { stop: { include: { locality: true } } },
            },
            departures: {
              orderBy: { departureMinutes: 'asc' },
              include: { calendar: { select: { code: true } } },
            },
          },
        },
      },
    });
    if (!line) throw new NotFoundException('Ligne introuvable.');

    // Le tracé (type PostGIS) n'est pas lisible par Prisma : requête SQL dédiée.
    const shapes = await this.prisma.$queryRaw<
      { id: string; coordinates: [number, number][] | null }[]
    >`
      SELECT id, (ST_AsGeoJSON(shape)::json -> 'coordinates') AS coordinates
      FROM line_directions
      WHERE line_id = ${line.id}::uuid
    `;
    const shapeById = new Map(shapes.map((shape) => [shape.id, shape.coordinates]));

    // Calendriers réellement utilisés par les départs de cette ligne.
    const calendars = await this.prisma.serviceCalendar.findMany({
      where: { departures: { some: { direction: { lineId: line.id } } } },
      orderBy: [{ priority: 'asc' }, { code: 'asc' }],
    });

    return {
      id: line.id,
      code: line.code,
      nameFr: line.nameFr,
      nameAr: line.nameAr,
      type: line.type,
      color: line.color,
      governorateCode: line.governorate.code,
      operator: line.operator ? { code: line.operator.code, name: line.operator.name } : null,
      directions: line.directions.map((direction) => ({
        ...toDirectionSummary(direction),
        shape: toGeoPoints(shapeById.get(direction.id) ?? null),
        stops: direction.stops.map((lineStop) => ({
          sequence: lineStop.sequence,
          minutesFromStart: lineStop.minutesFromStart,
          stop: toStopSummary(lineStop.stop),
        })),
        departures: direction.departures.map((departure) => ({
          calendarCode: departure.calendar.code,
          departureMinutes: departure.departureMinutes,
        })),
      })),
      calendars: calendars.map(toServiceCalendar),
    };
  }

  /** Arrêt et lignes actives qui le desservent (avec le ou les sens concernés). */
  async getStop(id: string): Promise<StopDetail> {
    const stop = await this.prisma.stop.findFirst({
      where: { id, ...VISIBLE_STOP },
      include: {
        locality: true,
        governorate: true,
        lineStops: {
          where: { direction: { line: { status: 'ACTIVE' } } },
          include: { direction: { include: { line: { include: { governorate: true } } } } },
        },
      },
    });
    if (!stop) throw new NotFoundException('Arrêt introuvable.');

    // Regroupe les sens par ligne (un arrêt est souvent desservi dans les deux sens).
    const lines = new Map<string, StopDetail['lines'][number]>();
    for (const { direction } of stop.lineStops) {
      const { line } = direction;
      const entry = lines.get(line.id) ?? {
        id: line.id,
        code: line.code,
        nameFr: line.nameFr,
        nameAr: line.nameAr,
        type: line.type,
        color: line.color,
        governorateCode: line.governorate.code,
        directions: [],
      };
      if (!entry.directions.some((d) => d.id === direction.id)) {
        entry.directions.push(toDirectionSummary(direction));
      }
      lines.set(line.id, entry);
    }

    return {
      ...toStopSummary(stop),
      governorateCode: stop.governorate.code,
      lines: [...lines.values()].sort((a, b) => compareLineCodes(a.code, b.code)),
    };
  }
}
