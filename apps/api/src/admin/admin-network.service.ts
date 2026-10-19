import type {
  AdminGovernorate,
  AdminLouageStation,
  AdminStop,
  AdminStopsQuery,
  LineBadgeInfo,
  UpdateStopInput,
  UpsertLouageStationInput,
} from '@buslive/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { compareLineCodes, toLocalityOption } from '../network/network.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationLogService } from './moderation-log.service';

const stationInclude = {
  governorate: true,
  locality: { include: { governorate: true } },
  routes: {
    include: { destination: { include: { governorate: true } } },
    orderBy: { priceMillimes: 'asc' },
  },
} satisfies Prisma.LouageStationInclude;

type StationWithRelations = Prisma.LouageStationGetPayload<{ include: typeof stationInclude }>;

/**
 * Réseau, réservé aux administrateurs : gouvernorats, arrêts, louages. Les
 * lignes et les horaires restent gérés par le seed (import GTFS en phase 11).
 */
@Injectable()
export class AdminNetworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly log: ModerationLogService,
  ) {}

  // --- Gouvernorats ---------------------------------------------------------------------

  async listGovernorates(): Promise<AdminGovernorate[]> {
    const rows = await this.prisma.governorate.findMany({
      include: { _count: { select: { lines: true, stops: true } } },
      orderBy: { code: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      nameFr: row.nameFr,
      nameAr: row.nameAr,
      isActive: row.isActive,
      lines: row._count.lines,
      stops: row._count.stops,
    }));
  }

  /** Ouvrir (ou fermer) un gouvernorat : ses lignes et arrêts deviennent visibles dans l'app. */
  async setGovernorateActive(moderatorId: string, code: string, isActive: boolean): Promise<void> {
    const governorate = await this.prisma.governorate.findUnique({ where: { code } });
    if (!governorate) throw new NotFoundException('Gouvernorat introuvable.');
    await this.prisma.$transaction(async (tx) => {
      await tx.governorate.update({ where: { code }, data: { isActive } });
      await this.log.record(tx, {
        moderatorId,
        type: 'GOVERNORATE_UPDATED',
        targetType: 'governorate',
        targetId: code,
        details: { isActiveBefore: governorate.isActive, isActiveAfter: isActive },
      });
    });
  }

  // --- Arrêts ---------------------------------------------------------------------------------

  async listStops(query: AdminStopsQuery): Promise<AdminStop[]> {
    const stops = await this.prisma.stop.findMany({
      where: {
        ...(query.q && {
          OR: [
            { nameFr: { contains: query.q, mode: 'insensitive' } },
            { nameAr: { contains: query.q } },
            { code: { contains: query.q, mode: 'insensitive' } },
          ],
        }),
        ...(query.governorate && { governorate: { code: query.governorate } }),
        ...(query.status && { status: query.status }),
      },
      include: {
        governorate: true,
        lineStops: {
          select: {
            direction: { select: { line: { select: { id: true, code: true, color: true } } } },
          },
        },
      },
      orderBy: { nameFr: 'asc' },
      take: query.limit,
    });
    return stops.map((stop) => {
      const badges = new Map<string, LineBadgeInfo>();
      for (const { direction } of stop.lineStops) badges.set(direction.line.id, direction.line);
      return {
        id: stop.id,
        code: stop.code,
        nameFr: stop.nameFr,
        nameAr: stop.nameAr,
        latitude: stop.latitude,
        longitude: stop.longitude,
        status: stop.status,
        governorateCode: stop.governorate.code,
        lines: [...badges.values()].sort((a, b) => compareLineCodes(a.code, b.code)),
      };
    });
  }

  async updateStop(moderatorId: string, id: string, input: UpdateStopInput): Promise<void> {
    const stop = await this.prisma.stop.findUnique({ where: { id } });
    if (!stop) throw new NotFoundException('Arrêt introuvable.');
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.stop.update({ where: { id }, data: input });
      await this.log.record(tx, {
        moderatorId,
        type: 'STOP_UPDATED',
        targetType: 'stop',
        targetId: id,
        details: {
          nameFrBefore: stop.nameFr,
          nameFrAfter: updated.nameFr,
          nameArBefore: stop.nameAr,
          nameArAfter: updated.nameAr,
          latitudeBefore: stop.latitude,
          latitudeAfter: updated.latitude,
          longitudeBefore: stop.longitude,
          longitudeAfter: updated.longitude,
          statusBefore: stop.status,
          statusAfter: updated.status,
        },
      });
    });
  }

  // --- Louages ---------------------------------------------------------------------------------

  async listLouageStations(): Promise<AdminLouageStation[]> {
    const stations = await this.prisma.louageStation.findMany({
      include: stationInclude,
      orderBy: { nameFr: 'asc' },
    });
    return stations.map(toAdminStation);
  }

  /** Création (id absent) ou remplacement complet, destinations comprises. */
  async saveLouageStation(
    moderatorId: string,
    input: UpsertLouageStationInput,
    id?: string,
  ): Promise<AdminLouageStation> {
    const locality = await this.prisma.locality.findUnique({ where: { id: input.localityId } });
    if (!locality) throw new NotFoundException('Localité introuvable.');
    const destinations = await this.prisma.locality.count({
      where: { id: { in: input.routes.map((route) => route.destinationLocalityId) } },
    });
    if (destinations !== input.routes.length)
      throw new NotFoundException('Destination introuvable.');
    if (id && !(await this.prisma.louageStation.findUnique({ where: { id } }))) {
      throw new NotFoundException('Station introuvable.');
    }

    const data = {
      code: input.code,
      nameFr: input.nameFr,
      nameAr: input.nameAr,
      latitude: input.latitude,
      longitude: input.longitude,
      openingMinutes: input.openingMinutes,
      closingMinutes: input.closingMinutes,
      localityId: locality.id,
      governorateId: locality.governorateId,
      status: 'ACTIVE' as const,
    };
    try {
      const saved = await this.prisma.$transaction(async (tx) => {
        const station = id
          ? await tx.louageStation.update({ where: { id }, data })
          : await tx.louageStation.create({ data });
        // Les destinations sont remplacées en bloc : plus simple et sans état intermédiaire.
        await tx.louageRoute.deleteMany({ where: { stationId: station.id } });
        await tx.louageRoute.createMany({
          data: input.routes.map((route) => ({ stationId: station.id, ...route })),
        });
        await this.log.record(tx, {
          moderatorId,
          type: 'LOUAGE_STATION_SAVED',
          targetType: 'louage_station',
          targetId: station.id,
          details: { code: input.code, created: !id, routes: input.routes.length },
        });
        return station;
      });
      return toAdminStation(
        await this.prisma.louageStation.findUniqueOrThrow({
          where: { id: saved.id },
          include: stationInclude,
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ce code de station existe déjà.');
      }
      throw error;
    }
  }

  /** Archiver (jamais supprimer : l'historique et le journal restent cohérents). */
  async archiveLouageStation(moderatorId: string, id: string): Promise<void> {
    const station = await this.prisma.louageStation.findUnique({ where: { id } });
    if (!station) throw new NotFoundException('Station introuvable.');
    await this.prisma.$transaction(async (tx) => {
      await tx.louageStation.update({ where: { id }, data: { status: 'ARCHIVED' } });
      await this.log.record(tx, {
        moderatorId,
        type: 'LOUAGE_STATION_ARCHIVED',
        targetType: 'louage_station',
        targetId: id,
        details: { code: station.code, statusBefore: station.status },
      });
    });
  }
}

function toAdminStation(station: StationWithRelations): AdminLouageStation {
  return {
    id: station.id,
    code: station.code,
    nameFr: station.nameFr,
    nameAr: station.nameAr,
    latitude: station.latitude,
    longitude: station.longitude,
    locality: station.locality ? toLocalityOption(station.locality) : null,
    governorateCode: station.governorate.code,
    openingMinutes: station.openingMinutes,
    closingMinutes: station.closingMinutes,
    status: station.status,
    routes: station.routes.map((route) => ({
      id: route.id,
      destination: toLocalityOption(route.destination),
      priceMillimes: route.priceMillimes,
      durationMinutes: route.durationMinutes,
    })),
  };
}
