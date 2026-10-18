import { type GeoPoint, type StopMilestone, stopMilestones } from '@buslive/shared';
import { Injectable, NotFoundException } from '@nestjs/common';

import { VISIBLE_LINE } from '../network/network.filters';
import { PrismaService } from '../prisma/prisma.service';

/** Tout ce qu'il faut savoir d'un sens de ligne pour suivre un bus dessus. */
export interface RouteData {
  lineId: string;
  directionId: string;
  /** Tracé du parcours (ou, à défaut, la suite des arrêts). */
  shape: GeoPoint[];
  /** Arrêts positionnés sur le tracé, avec leur temps de trajet prévu. */
  milestones: StopMilestone[];
  /** Arrêts dans l'ordre du parcours (pour repérer les passages aux arrêts). */
  stops: { stopId: string; minutesFromStart: number }[];
  terminus: GeoPoint & { minutesFromStart: number };
}

/** Durée de conservation en mémoire d'un parcours (les tracés changent rarement). */
const TTL_MS = 10 * 60 * 1000;

/**
 * Parcours gardés en mémoire : chaque position reçue est projetée sur le tracé,
 * il serait coûteux de relire la base à chaque fois.
 */
@Injectable()
export class RouteCacheService {
  private readonly cache = new Map<string, { route: RouteData; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async get(directionId: string): Promise<RouteData> {
    const cached = this.cache.get(directionId);
    if (cached && cached.expiresAt > Date.now()) return cached.route;
    const route = await this.load(directionId);
    this.cache.set(directionId, { route, expiresAt: Date.now() + TTL_MS });
    return route;
  }

  private async load(directionId: string): Promise<RouteData> {
    const direction = await this.prisma.lineDirection.findFirst({
      where: { id: directionId, line: VISIBLE_LINE },
      include: {
        stops: {
          where: { stop: { status: 'ACTIVE' } },
          orderBy: { sequence: 'asc' },
          include: { stop: { select: { latitude: true, longitude: true } } },
        },
      },
    });
    if (!direction || direction.stops.length === 0) {
      throw new NotFoundException('Parcours introuvable pour ce sens de ligne.');
    }

    // Tracé PostGIS (type non géré par Prisma) : lu en SQL brut.
    const [row] = await this.prisma.$queryRaw<{ coordinates: [number, number][] | null }[]>`
      SELECT (ST_AsGeoJSON(shape)::json -> 'coordinates') AS coordinates
      FROM line_directions WHERE id = ${directionId}::uuid
    `;
    const stops = direction.stops.map((lineStop) => ({
      latitude: lineStop.stop.latitude,
      longitude: lineStop.stop.longitude,
      minutesFromStart: lineStop.minutesFromStart,
    }));
    const shape = row?.coordinates
      ? row.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }))
      : stops.map(({ latitude, longitude }) => ({ latitude, longitude }));

    return {
      lineId: direction.lineId,
      directionId,
      shape,
      milestones: stopMilestones(shape, stops),
      stops: direction.stops.map((lineStop) => ({
        stopId: lineStop.stopId,
        minutesFromStart: lineStop.minutesFromStart,
      })),
      terminus: stops.at(-1)!,
    };
  }
}
