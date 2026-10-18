import { FAVORITE_RULES, type Favorites, type LineBadgeInfo } from '@buslive/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { VISIBLE_LINE, VISIBLE_STOP } from '../network/network.filters';
import { compareLineCodes, toLineSummary, toStopSummary } from '../network/network.mapper';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Lignes et arrêts favoris. Ajouter ou retirer est IDEMPOTENT : ajouter deux
 * fois le même favori ne fait rien (l'app peut réessayer sans risque).
 */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Favoris encore visibles (une ligne désactivée disparaît, sans être supprimée). */
  async list(userId: string): Promise<Favorites> {
    const [lines, stops] = await Promise.all([
      this.prisma.favoriteLine.findMany({
        where: { userId, line: VISIBLE_LINE },
        include: {
          line: {
            include: {
              operator: true,
              governorate: true,
              directions: { orderBy: { direction: 'asc' } },
            },
          },
        },
      }),
      this.prisma.favoriteStop.findMany({
        where: { userId, stop: VISIBLE_STOP },
        // Ordre d'ajout : l'utilisateur retrouve ses arrêts là où il les a mis.
        orderBy: { createdAt: 'asc' },
        include: {
          stop: {
            include: {
              locality: true,
              lineStops: {
                where: { direction: { line: VISIBLE_LINE } },
                select: {
                  direction: {
                    select: { line: { select: { id: true, code: true, color: true } } },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      lines: lines
        .map((favorite) => toLineSummary(favorite.line))
        .sort((a, b) => compareLineCodes(a.code, b.code)),
      stops: stops.map(({ stop }) => {
        // Une pastille par ligne, même si elle dessert l'arrêt dans les deux sens.
        const badges = new Map<string, LineBadgeInfo>();
        for (const { direction } of stop.lineStops) badges.set(direction.line.id, direction.line);
        return {
          ...toStopSummary(stop),
          lines: [...badges.values()].sort((a, b) => compareLineCodes(a.code, b.code)),
        };
      }),
    };
  }

  async addLine(userId: string, lineId: string): Promise<void> {
    const line = await this.prisma.line.findFirst({ where: { id: lineId, ...VISIBLE_LINE } });
    if (!line) throw new NotFoundException('Ligne introuvable.');
    const existing = await this.prisma.favoriteLine.findUnique({
      where: { userId_lineId: { userId, lineId } },
    });
    if (existing) return;
    this.checkLimit(await this.prisma.favoriteLine.count({ where: { userId } }), 'lignes');
    // skipDuplicates : deux ajouts simultanés ne provoquent pas d'erreur.
    await this.prisma.favoriteLine.createMany({ data: { userId, lineId }, skipDuplicates: true });
  }

  async removeLine(userId: string, lineId: string): Promise<void> {
    await this.prisma.favoriteLine.deleteMany({ where: { userId, lineId } });
  }

  async addStop(userId: string, stopId: string): Promise<void> {
    const stop = await this.prisma.stop.findFirst({ where: { id: stopId, ...VISIBLE_STOP } });
    if (!stop) throw new NotFoundException('Arrêt introuvable.');
    const existing = await this.prisma.favoriteStop.findUnique({
      where: { userId_stopId: { userId, stopId } },
    });
    if (existing) return;
    this.checkLimit(await this.prisma.favoriteStop.count({ where: { userId } }), 'arrêts');
    await this.prisma.favoriteStop.createMany({ data: { userId, stopId }, skipDuplicates: true });
  }

  async removeStop(userId: string, stopId: string): Promise<void> {
    await this.prisma.favoriteStop.deleteMany({ where: { userId, stopId } });
  }

  private checkLimit(count: number, kind: string): void {
    if (count >= FAVORITE_RULES.maxPerKind) {
      throw new ConflictException(
        `Tu as atteint la limite de ${FAVORITE_RULES.maxPerKind} ${kind} favoris.`,
      );
    }
  }
}
