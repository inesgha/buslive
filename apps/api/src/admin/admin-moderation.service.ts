import {
  type AdminReport,
  type AdminReportsQuery,
  type AdminRideFlag,
  type AdminStopProposal,
  distanceMeters,
  type ModerateReportInput,
  type ResolveRideFlagsInput,
  type ReviewStopProposalInput,
  type RideFlagReason,
  type StopMove,
  TRUST_RULES,
} from '@buslive/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { toLocalityOption } from '../network/network.mapper';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { reportInclude, toReportDto } from '../reports/reports.mapper';
import { ReportsService } from '../reports/reports.service';
import { TrustService } from '../reports/trust.service';
import { RidesService } from '../rides/rides.service';
import { CONTESTED_REPORTS, PENDING_STOP_MOVES, PENDING_STOP_PROPOSALS } from './admin.filters';
import { ModerationLogService } from './moderation-log.service';

const author = { select: { id: true, displayName: true, trustScore: true } } as const;

/**
 * Décisions des modérateurs. Chaque action est écrite au journal, dans la même
 * transaction que l'action quand c'est possible.
 */
@Injectable()
export class AdminModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly log: ModerationLogService,
    private readonly reports: ReportsService,
    private readonly trust: TrustService,
    private readonly rides: RidesService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- Signalements -----------------------------------------------------------------

  async listReports(query: AdminReportsQuery): Promise<AdminReport[]> {
    const where: Prisma.ReportWhereInput = query.contested
      ? CONTESTED_REPORTS
      : {
          ...(query.status && { status: query.status }),
          ...(query.type && { type: query.type }),
          ...(query.lineId && { lineId: query.lineId }),
        };
    const rows = await this.prisma.report.findMany({
      where,
      include: { ...reportInclude(), user: author },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    return rows.map((row) => ({
      ...toReportDto(row),
      hidden: row.hidden,
      author: row.user,
      confirmWeight: row.confirmWeight,
      denyWeight: row.denyWeight,
      proposedLatitude: row.proposedLatitude,
      proposedLongitude: row.proposedLongitude,
      moderatedAt: row.moderatedAt?.toISOString() ?? null,
    }));
  }

  async moderateReport(
    moderatorId: string,
    reportId: string,
    { decision }: ModerateReportInput,
  ): Promise<void> {
    if (decision === 'HIDE') {
      const report = await this.prisma.report.findUnique({ where: { id: reportId } });
      if (!report) throw new NotFoundException('Signalement introuvable.');
      await this.prisma.$transaction(async (tx) => {
        await tx.report.update({ where: { id: reportId }, data: { hidden: true } });
        await this.log.record(tx, {
          moderatorId,
          type: 'REPORT_HIDDEN',
          targetType: 'report',
          targetId: reportId,
          details: { status: report.status, hiddenBefore: report.hidden },
        });
      });
      return;
    }
    const status = decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED';
    await this.reports.moderate(reportId, status, (tx) =>
      this.log.record(tx, {
        moderatorId,
        type: decision === 'CONFIRM' ? 'REPORT_CONFIRMED' : 'REPORT_REJECTED',
        targetType: 'report',
        targetId: reportId,
        details: { statusBefore: 'ACTIVE', statusAfter: status },
      }),
    );
  }

  // --- Arrêts déplacés --------------------------------------------------------------------

  async listStopMoves(): Promise<StopMove[]> {
    const rows = await this.prisma.report.findMany({
      where: PENDING_STOP_MOVES,
      include: { stop: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return rows.flatMap((row) => {
      if (!row.stop || row.proposedLatitude === null || row.proposedLongitude === null) return [];
      const proposed = { latitude: row.proposedLatitude, longitude: row.proposedLongitude };
      return [
        {
          reportId: row.id,
          stop: {
            id: row.stop.id,
            nameFr: row.stop.nameFr,
            nameAr: row.stop.nameAr,
            latitude: row.stop.latitude,
            longitude: row.stop.longitude,
          },
          proposed,
          distanceMeters: Math.round(distanceMeters(row.stop, proposed)),
          confirmations: row.confirmCount,
          createdAt: row.createdAt.toISOString(),
        },
      ];
    });
  }

  /** Appliquer la nouvelle position à l'arrêt, ou classer sans suite. */
  async decideStopMove(moderatorId: string, reportId: string, apply: boolean): Promise<void> {
    const report = await this.prisma.report.findFirst({
      where: { id: reportId, type: 'STOP_MOVED' },
      include: { stop: true },
    });
    if (!report?.stop) throw new NotFoundException('Signalement introuvable.');
    if (report.moderatedAt) throw new ConflictException('Ce déplacement a déjà été examiné.');
    const { stop } = report;

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.report.updateMany({
        where: { id: reportId, moderatedAt: null },
        data: { moderatedAt: new Date() },
      });
      if (count !== 1) throw new ConflictException('Ce déplacement a déjà été examiné.');
      if (apply && report.proposedLatitude !== null && report.proposedLongitude !== null) {
        // Le trigger « stops_set_location » recalcule le point PostGIS.
        await tx.stop.update({
          where: { id: stop.id },
          data: { latitude: report.proposedLatitude, longitude: report.proposedLongitude },
        });
      }
      await this.log.record(tx, {
        moderatorId,
        type: apply ? 'STOP_MOVE_APPLIED' : 'STOP_MOVE_DISMISSED',
        targetType: 'stop',
        targetId: stop.id,
        details: {
          reportId,
          latitudeBefore: stop.latitude,
          longitudeBefore: stop.longitude,
          latitudeAfter: apply ? report.proposedLatitude : stop.latitude,
          longitudeAfter: apply ? report.proposedLongitude : stop.longitude,
        },
      });
    });
  }

  // --- Arrêts proposés ----------------------------------------------------------------------

  async listStopProposals(): Promise<AdminStopProposal[]> {
    const stops = await this.prisma.stop.findMany({
      where: PENDING_STOP_PROPOSALS,
      include: { proposedBy: author, governorate: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    if (stops.length === 0) return [];

    // Arrêt existant le plus proche de chaque proposition (doublon possible).
    const nearest = await this.prisma.$queryRaw<
      { id: string; near_id: string | null; near_name: string | null; distance: number | null }[]
    >`
      SELECT p.id, n.id AS near_id, n.name_fr AS near_name,
             ST_Distance(p.location, n.location) AS distance
      FROM stops p
      LEFT JOIN LATERAL (
        SELECT s.id, s.name_fr, s.location FROM stops s
        WHERE s.id <> p.id AND s.status IN ('ACTIVE', 'PENDING')
        ORDER BY s.location <-> p.location
        LIMIT 1
      ) n ON true
      WHERE p.id = ANY(${stops.map((stop) => stop.id)}::uuid[])
    `;
    const nearestById = new Map(nearest.map((row) => [row.id, row]));
    const lines = await this.prisma.line.findMany({
      where: { id: { in: stops.flatMap((stop) => stop.proposedLineIds) } },
      select: { id: true, code: true, color: true },
    });
    const lineById = new Map(lines.map((line) => [line.id, line]));

    return stops.map((stop) => {
      const near = nearestById.get(stop.id);
      return {
        id: stop.id,
        nameFr: stop.nameFr,
        nameAr: stop.nameAr,
        latitude: stop.latitude,
        longitude: stop.longitude,
        status: 'PENDING' as const,
        lines: stop.proposedLineIds.flatMap((id) => lineById.get(id) ?? []),
        createdAt: stop.createdAt.toISOString(),
        governorateCode: stop.governorate.code,
        proposedBy: stop.proposedBy,
        nearestStop:
          near?.near_id && near.near_name && near.distance !== null
            ? {
                id: near.near_id,
                nameFr: near.near_name,
                distanceMeters: Math.round(near.distance),
              }
            : null,
      };
    });
  }

  /**
   * Approuver (avec corrections éventuelles) ou refuser une proposition. Le
   * proposant gagne des points si elle est approuvée, et il est prévenu.
   */
  async reviewStopProposal(
    moderatorId: string,
    stopId: string,
    input: ReviewStopProposalInput,
  ): Promise<void> {
    const stop = await this.prisma.stop.findFirst({
      where: { id: stopId, proposedById: { not: null } },
    });
    if (!stop) throw new NotFoundException('Proposition introuvable.');
    if (stop.status !== 'PENDING') throw new ConflictException('Proposition déjà examinée.');
    const approve = input.decision === 'APPROVE';
    const proposerId = stop.proposedById;
    const names = {
      nameFr: input.nameFr ?? stop.nameFr,
      nameAr: input.nameAr ?? stop.nameAr,
    };

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.stop.updateMany({
        where: { id: stopId, status: 'PENDING' },
        data: {
          status: approve ? 'ACTIVE' : 'REJECTED',
          reviewedAt: new Date(),
          ...(approve && names),
          ...(approve &&
            input.latitude !== undefined &&
            input.longitude !== undefined && {
              latitude: input.latitude,
              longitude: input.longitude,
            }),
        },
      });
      if (count !== 1) throw new ConflictException('Proposition déjà examinée.');
      if (approve && proposerId) await this.trust.award(tx, proposerId, 'STOP_APPROVED');
      await this.log.record(tx, {
        moderatorId,
        type: approve ? 'STOP_APPROVED' : 'STOP_REJECTED',
        targetType: 'stop',
        targetId: stopId,
        details: {
          nameFrBefore: stop.nameFr,
          nameFrAfter: approve ? names.nameFr : stop.nameFr,
          nameArBefore: stop.nameAr,
          nameArAfter: approve ? names.nameAr : stop.nameAr,
        },
      });
    });

    if (proposerId) {
      await this.notifications.notify(
        proposerId,
        {
          type: 'STOP_PROPOSAL_REVIEWED',
          data: {
            stopId,
            nameFr: approve ? names.nameFr : stop.nameFr,
            nameAr: approve ? names.nameAr : stop.nameAr,
            approved: approve,
            points: approve ? TRUST_RULES.points.STOP_APPROVED : 0,
          },
        },
        `stop-review:${stopId}`,
      );
    }
  }

  // --- Covoiturage signalé -------------------------------------------------------------------

  async listRideFlags(): Promise<AdminRideFlag[]> {
    const flags = await this.prisma.rideFlag.findMany({
      where: { resolvedAt: null },
      include: {
        offer: {
          include: {
            from: { include: { governorate: true } },
            to: { include: { governorate: true } },
            driver: author,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const byOffer = new Map<string, typeof flags>();
    for (const flag of flags)
      byOffer.set(flag.offerId, [...(byOffer.get(flag.offerId) ?? []), flag]);

    return [...byOffer.values()]
      .map((group) => {
        const { offer } = group[0]!;
        const counts = new Map<RideFlagReason, number>();
        for (const flag of group) counts.set(flag.reason, (counts.get(flag.reason) ?? 0) + 1);
        return {
          offerId: offer.id,
          from: toLocalityOption(offer.from),
          to: toLocalityOption(offer.to),
          departureAt: offer.departureAt.toISOString(),
          status: offer.status,
          driver: offer.driver,
          flags: [...counts].map(([reason, count]) => ({ reason, count })),
          total: group.length,
          lastFlaggedAt: group[0]!.createdAt.toISOString(),
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  /** Annuler l'annonce (passagers prévenus) ou classer les signalements. */
  async resolveRideFlags(
    moderatorId: string,
    offerId: string,
    { action }: ResolveRideFlagsInput,
  ): Promise<void> {
    const offer = await this.prisma.rideOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Trajet introuvable.');
    if (action === 'CANCEL') await this.rides.cancelByModerator(offerId);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.rideFlag.updateMany({
        where: { offerId, resolvedAt: null },
        data: { resolvedAt: new Date() },
      });
      await this.log.record(tx, {
        moderatorId,
        type: action === 'CANCEL' ? 'RIDE_CANCELLED' : 'RIDE_FLAGS_DISMISSED',
        targetType: 'ride',
        targetId: offerId,
        details: { flagsResolved: count, statusBefore: offer.status },
      });
    });
  }
}
