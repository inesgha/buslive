import { computeLineStats, type LineStats, STATS_RULES } from '@buslive/shared';
import { Injectable, NotFoundException } from '@nestjs/common';

import { VISIBLE_LINE } from '../network/network.filters';
import { PrismaService } from '../prisma/prisma.service';

/** Statistiques d'une ligne sur les 30 derniers jours. */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async lineStats(lineId: string, now = new Date()): Promise<LineStats> {
    const line = await this.prisma.line.findFirst({ where: { id: lineId, ...VISIBLE_LINE } });
    if (!line) throw new NotFoundException('Ligne introuvable.');

    const since = new Date(now.getTime() - STATS_RULES.periodDays * 24 * 60 * 60 * 1000);
    const [observations, notCameConfirmed] = await Promise.all([
      // Seuls les passages rapprochés d'un horaire ont un retard.
      this.prisma.stopPassageObservation.findMany({
        where: { lineId, observedAt: { gte: since }, delayMinutes: { not: null } },
        select: { delayMinutes: true },
      }),
      this.prisma.report.count({
        where: { lineId, type: 'NOT_CAME', status: 'CONFIRMED', createdAt: { gte: since } },
      }),
    ]);

    return {
      lineId,
      periodDays: STATS_RULES.periodDays,
      notCameConfirmed,
      ...computeLineStats(observations.map((o) => o.delayMinutes ?? 0)),
    };
  }
}
