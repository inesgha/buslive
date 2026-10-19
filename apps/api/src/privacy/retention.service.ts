import { RETENTION_RULES } from '@buslive/shared';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Premier nettoyage peu après le démarrage, puis une fois par jour. */
const FIRST_RUN_MS = 60_000;

export interface RetentionReport {
  livePositionsCleared: number;
  liveSessions: number;
  reports: number;
  observations: number;
  rideOffers: number;
  refreshTokens: number;
  tripShares: number;
}

/**
 * Applique les durées de conservation (RETENTION_RULES, @buslive/shared),
 * celles annoncées dans la politique de confidentialité. Les notifications et
 * les téléphones sont nettoyés par NotificationsService ; le journal de
 * modération n'est jamais effacé.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    const run = () =>
      void this.purge().catch((error: Error) =>
        this.logger.warn(`Nettoyage des données impossible : ${error.message}`),
      );
    this.timers = [setTimeout(run, FIRST_RUN_MS), setInterval(run, DAY_MS)];
    for (const timer of this.timers) timer.unref();
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
  }

  async purge(now = new Date()): Promise<RetentionReport> {
    const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const R = RETENTION_RULES;

    const livePositionsCleared = await this.prisma.liveSession.updateMany({
      where: {
        status: 'ENDED',
        endedAt: { lt: ago(R.liveSessionPositionDays) },
        lastLatitude: { not: null },
      },
      data: { lastLatitude: null, lastLongitude: null },
    });
    const liveSessions = await this.prisma.liveSession.deleteMany({
      where: { status: 'ENDED', endedAt: { lt: ago(R.liveSessionDays) } },
    });
    const reports = await this.prisma.report.deleteMany({
      where: { createdAt: { lt: ago(R.reportDays) } },
    });
    const observations = await this.prisma.stopPassageObservation.deleteMany({
      where: { observedAt: { lt: ago(R.observationDays) } },
    });
    const rideOffers = await this.prisma.rideOffer.deleteMany({
      where: { departureAt: { lt: ago(R.rideOfferDays) } },
    });
    const refreshTokens = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: ago(R.refreshTokenDays) } },
          { revokedAt: { lt: ago(R.refreshTokenDays) } },
        ],
      },
    });
    // Un lien vit 3 h au plus : créé il y a plus de 7 j + 3 h, il est expiré depuis 7 j au moins.
    const tripShares = await this.prisma.tripShare.deleteMany({
      where: { createdAt: { lt: new Date(ago(R.tripShareDays).getTime() - 3 * 60 * 60 * 1000) } },
    });

    const report: RetentionReport = {
      livePositionsCleared: livePositionsCleared.count,
      liveSessions: liveSessions.count,
      reports: reports.count,
      observations: observations.count,
      rideOffers: rideOffers.count,
      refreshTokens: refreshTokens.count,
      tripShares: tripShares.count,
    };
    this.logger.log({ message: 'nettoyage des données', ...report });
    return report;
  }
}
