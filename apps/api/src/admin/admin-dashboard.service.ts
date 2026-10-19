import { type AdminDashboard, REPORT_STATUSES, type ReportStatus } from '@buslive/shared';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CONTESTED_REPORTS, PENDING_STOP_MOVES, PENDING_STOP_PROPOSALS } from './admin.filters';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Chiffres clés : usage réel, et ce qui attend une décision humaine. */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(now = new Date()): Promise<AdminDashboard> {
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

    const [
      usersTotal,
      usersNew,
      usersSuspended,
      activeSessions,
      reports24h,
      reports7d,
      byStatus,
      topLines,
      ridesUpcoming,
      rideRequests,
      notifications24h,
      contestedReports,
      stopMoves,
      stopProposals,
      flaggedOffers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.user.count({ where: { suspendedAt: { not: null } } }),
      this.prisma.liveSession.count({ where: { status: 'ACTIVE' } }),
      this.prisma.report.count({ where: { createdAt: { gte: dayAgo } } }),
      this.prisma.report.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.report.groupBy({
        by: ['status'],
        where: { createdAt: { gte: weekAgo } },
        _count: { _all: true },
      }),
      this.prisma.report.groupBy({
        by: ['lineId'],
        where: { createdAt: { gte: weekAgo } },
        _count: { _all: true },
        orderBy: { _count: { lineId: 'desc' } },
        take: 5,
      }),
      this.prisma.rideOffer.count({ where: { status: 'ACTIVE', departureAt: { gt: now } } }),
      this.prisma.rideRequest.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.notification.count({ where: { createdAt: { gte: dayAgo } } }),
      this.prisma.report.count({ where: CONTESTED_REPORTS }),
      this.prisma.report.count({ where: PENDING_STOP_MOVES }),
      this.prisma.stop.count({ where: PENDING_STOP_PROPOSALS }),
      this.prisma.rideFlag.groupBy({ by: ['offerId'], where: { resolvedAt: null } }),
    ]);

    const lines = await this.prisma.line.findMany({
      where: { id: { in: topLines.map((row) => row.lineId) } },
      select: { id: true, code: true, color: true, nameFr: true },
    });
    const lineById = new Map(lines.map((line) => [line.id, line]));
    const statusCounts = Object.fromEntries(REPORT_STATUSES.map((status) => [status, 0])) as Record<
      ReportStatus,
      number
    >;
    for (const row of byStatus) statusCounts[row.status] = row._count._all;

    return {
      users: { total: usersTotal, newLast7Days: usersNew, suspended: usersSuspended },
      live: { activeSessions },
      reports: { last24h: reports24h, last7Days: reports7d, byStatus: statusCounts },
      topReportedLines: topLines.flatMap((row) => {
        const line = lineById.get(row.lineId);
        return line ? [{ ...line, reports: row._count._all }] : [];
      }),
      rides: { upcoming: ridesUpcoming, requestsLast7Days: rideRequests },
      notifications: { last24h: notifications24h },
      queues: {
        contestedReports,
        stopMoves,
        stopProposals,
        rideFlags: flaggedOffers.length,
      },
    };
  }
}
