import type { NearbyLouageQuery, NearbyLouageStation } from '@buslive/shared';
import { Injectable } from '@nestjs/common';

import { toLocalityOption } from '../network/network.mapper';
import { PrismaService } from '../prisma/prisma.service';

const localityInclude = { include: { governorate: true } } as const;

/** Stations de louage et leurs destinations (données de référence). */
@Injectable()
export class LouageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stations actives autour d'un point, de la plus proche à la plus loin, comme
   * les arrêts proches (ST_DWithin + tri « <-> » sur l'index GIST). Option
   * « to » : seulement celles qui desservent cette localité. La position reçue
   * n'est ni stockée ni journalisée.
   */
  async findNearby({
    lat,
    lng,
    radius,
    to,
    limit,
  }: NearbyLouageQuery): Promise<NearbyLouageStation[]> {
    const rows = await this.prisma.$queryRaw<{ id: string; distance: number }[]>`
      WITH here AS (
        SELECT ST_SetSRID(
          ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326
        )::geography AS point
      )
      SELECT s.id, ST_Distance(s.location, here.point) AS distance
      FROM louage_stations s
      CROSS JOIN here
      JOIN governorates g ON g.id = s.governorate_id AND g.is_active
      WHERE s.status = 'ACTIVE'
        AND ST_DWithin(s.location, here.point, ${radius}::double precision)
        AND (
          ${to ?? null}::uuid IS NULL
          OR EXISTS (
            SELECT 1 FROM louage_routes r
            WHERE r.station_id = s.id AND r.destination_locality_id = ${to ?? null}::uuid
          )
        )
      ORDER BY s.location <-> here.point
      LIMIT ${limit}::int
    `;
    if (rows.length === 0) return [];

    const stations = await this.prisma.louageStation.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      include: {
        locality: localityInclude,
        routes: { include: { destination: localityInclude } },
      },
    });
    const byId = new Map(stations.map((station) => [station.id, station]));

    return rows.flatMap((row) => {
      const station = byId.get(row.id);
      if (!station) return [];
      return [
        {
          id: station.id,
          code: station.code,
          nameFr: station.nameFr,
          nameAr: station.nameAr,
          latitude: station.latitude,
          longitude: station.longitude,
          locality: station.locality ? toLocalityOption(station.locality) : null,
          openingMinutes: station.openingMinutes,
          closingMinutes: station.closingMinutes,
          distanceMeters: Math.round(row.distance),
          routes: station.routes
            // La destination demandée en premier, puis les moins chères.
            .sort(
              (a, b) =>
                Number(b.destinationLocalityId === to) - Number(a.destinationLocalityId === to) ||
                a.priceMillimes - b.priceMillimes,
            )
            .map((route) => ({
              id: route.id,
              destination: toLocalityOption(route.destination),
              priceMillimes: route.priceMillimes,
              durationMinutes: route.durationMinutes,
            })),
        },
      ];
    });
  }
}
