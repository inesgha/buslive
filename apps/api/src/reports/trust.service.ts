import {
  clampScore,
  TRUST_RULES,
  type TrustEventReason,
  type TrustSummary,
  trustLevel,
  tunisClock,
  voteWeight,
} from '@buslive/shared';
import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { LiveEvents } from '../live/live.events';
import { PrismaService } from '../prisma/prisma.service';

/** Client Prisma dans une transaction (les points sont toujours versés en transaction). */
type Tx = Prisma.TransactionClient;

/**
 * Score de confiance : versement des points (avec historique) et lecture du
 * score. Les règles chiffrées sont dans TRUST_RULES (@buslive/shared).
 */
@Injectable()
export class TrustService implements OnModuleInit {
  private readonly logger = new Logger(TrustService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly liveEvents: LiveEvents,
  ) {}

  onModuleInit(): void {
    // Partage « Je suis dans le bus » mené à bien → points (limités par jour).
    this.liveEvents.on('sharingCompleted', ({ userId }) => {
      void this.rewardSharing(userId).catch((error: Error) =>
        this.logger.warn(`Récompense de partage impossible : ${error.message}`),
      );
    });
  }

  /** Score et poids actuels d'un utilisateur. */
  async weightOf(userId: string, client: Tx | PrismaService = this.prisma) {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { trustScore: true },
    });
    const score = user?.trustScore ?? 0;
    return { score, weight: voteWeight(score) };
  }

  /**
   * Verse (ou retire) les points prévus pour « reason » et l'inscrit dans
   * l'historique. La ligne de l'utilisateur est verrouillée (FOR UPDATE) pour
   * qu'aucun point ne se perde si deux versements arrivent en même temps.
   */
  async award(tx: Tx, userId: string, reason: TrustEventReason, reportId?: string): Promise<void> {
    const [row] = await tx.$queryRaw<{ trust_score: number }[]>`
      SELECT trust_score FROM users WHERE id = ${userId}::uuid FOR UPDATE
    `;
    if (!row) return;
    const next = clampScore(row.trust_score + TRUST_RULES.points[reason]);
    const delta = next - row.trust_score;
    if (delta === 0) return; // déjà à la borne
    await tx.user.update({ where: { id: userId }, data: { trustScore: next } });
    await tx.trustEvent.create({ data: { userId, delta, reason, reportId } });
  }

  /** Récompense d'un partage mené à bien, au plus 3 fois par jour (jour de Tunis). */
  async rewardSharing(userId: string, now = new Date()): Promise<void> {
    const rewardedToday = await this.prisma.trustEvent.count({
      where: { userId, reason: 'SHARING_COMPLETED', createdAt: { gte: startOfTunisDay(now) } },
    });
    if (rewardedToday >= TRUST_RULES.maxRewardedSharingsPerDay) return;
    await this.prisma.$transaction((tx) => this.award(tx, userId, 'SHARING_COMPLETED'));
  }

  /** Score, niveau, poids et derniers mouvements de points de l'utilisateur. */
  async summary(userId: string): Promise<TrustSummary> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        trustScore: true,
        trustEvents: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!user) throw new NotFoundException('Compte introuvable.');
    return {
      score: user.trustScore,
      level: trustLevel(user.trustScore),
      weight: voteWeight(user.trustScore),
      events: user.trustEvents.map((event) => ({
        delta: event.delta,
        reason: event.reason,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }
}

/** Minuit, heure de Tunis, du jour de « now » (Tunisie : UTC+1, sans heure d'été). */
function startOfTunisDay(now: Date): Date {
  const { isoDate } = tunisClock(now);
  return new Date(Date.parse(`${isoDate}T00:00:00+01:00`));
}
