import type {
  ModerationAction as ModerationActionDto,
  ModerationActionType,
  ModerationLogQuery,
} from '@buslive/shared';
import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Client = Prisma.TransactionClient | PrismaService;

export interface ModerationEntry {
  moderatorId: string;
  type: ModerationActionType;
  targetType: 'report' | 'stop' | 'ride' | 'user' | 'governorate' | 'louage_station';
  targetId: string;
  /** Valeurs avant / après (texte, nombres, booléens : sérialisables en JSON). */
  details: Record<string, string | number | boolean | null>;
}

/**
 * Journal de modération, en AJOUT SEUL : un trigger PostgreSQL refuse toute
 * modification ou suppression (migration « moderation »). Chaque action d'un
 * modérateur y est écrite, si possible dans la même transaction que l'action.
 */
@Injectable()
export class ModerationLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(client: Client, entry: ModerationEntry): Promise<void> {
    await client.moderationAction.create({
      data: {
        moderatorId: entry.moderatorId,
        type: entry.type,
        targetType: entry.targetType,
        targetId: entry.targetId,
        details: entry.details,
      },
    });
  }

  async list(query: ModerationLogQuery): Promise<ModerationActionDto[]> {
    const rows = await this.prisma.moderationAction.findMany({
      where: query.type ? { type: query.type } : {},
      include: { moderator: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      moderator: row.moderator,
      targetType: row.targetType,
      targetId: row.targetId,
      details: (row.details ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
