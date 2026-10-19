import { type AdminUser, type AdminUsersQuery, ROLES, type Role } from '@buslive/shared';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/auth.types';
import { RefreshTokenService } from '../auth/refresh-token.service';
import type { Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationLogService } from './moderation-log.service';

/** Un modérateur ne peut agir que sur un compte de rôle STRICTEMENT inférieur au sien. */
function outranks(actor: Role, target: Role): boolean {
  return ROLES.indexOf(actor) > ROLES.indexOf(target);
}

/** Comptes : recherche, suspension, rôles. */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly log: ModerationLogService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async list(query: AdminUsersQuery): Promise<AdminUser[]> {
    const where: Prisma.UserWhereInput = {
      ...(query.q && {
        OR: [
          { email: { contains: query.q, mode: 'insensitive' } },
          { displayName: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
      ...(query.role && { role: query.role }),
      ...(query.suspended !== undefined && {
        suspendedAt: query.suspended ? { not: null } : null,
      }),
    };
    const users = await this.prisma.user.findMany({
      where,
      include: { _count: { select: { reports: true, rideOffers: true } } },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    return users.map(toAdminUser);
  }

  /**
   * Suspendre ou réactiver. La suspension révoque toutes les sessions : le
   * compte ne peut plus se reconnecter, et ses access tokens en cours
   * expirent d'eux-mêmes (15 min au plus).
   */
  async setSuspended(
    actor: AuthenticatedUser,
    targetId: string,
    suspended: boolean,
  ): Promise<AdminUser> {
    const target = await this.findTarget(actor, targetId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: targetId },
        data: { suspendedAt: suspended ? (target.suspendedAt ?? new Date()) : null },
        include: { _count: { select: { reports: true, rideOffers: true } } },
      });
      await this.log.record(tx, {
        moderatorId: actor.id,
        type: suspended ? 'USER_SUSPENDED' : 'USER_REINSTATED',
        targetType: 'user',
        targetId,
        details: { suspendedBefore: target.suspendedAt !== null, suspendedAfter: suspended },
      });
      return user;
    });
    if (suspended) await this.refreshTokens.revokeAllForUser(targetId);
    return toAdminUser(updated);
  }

  /** Changer le rôle (ADMIN seulement, vérifié par la route). Jamais le sien. */
  async changeRole(actor: AuthenticatedUser, targetId: string, role: Role): Promise<AdminUser> {
    if (actor.id === targetId) {
      throw new ForbiddenException('Tu ne peux pas changer ton propre rôle.');
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('Compte introuvable.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: targetId },
        data: { role },
        include: { _count: { select: { reports: true, rideOffers: true } } },
      });
      await this.log.record(tx, {
        moderatorId: actor.id,
        type: 'USER_ROLE_CHANGED',
        targetType: 'user',
        targetId,
        details: { roleBefore: target.role, roleAfter: role },
      });
      return user;
    });
    // Le rôle est inscrit dans l'access token : on force une reconnexion.
    await this.refreshTokens.revokeAllForUser(targetId);
    return toAdminUser(updated);
  }

  private async findTarget(actor: AuthenticatedUser, targetId: string): Promise<User> {
    if (actor.id === targetId)
      throw new ForbiddenException('Action impossible sur ton propre compte.');
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('Compte introuvable.');
    if (!outranks(actor.role, target.role)) {
      throw new ForbiddenException('Ce compte a un rôle égal ou supérieur au tien.');
    }
    return target;
  }
}

function toAdminUser(user: User & { _count: { reports: number; rideOffers: number } }): AdminUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    trustScore: user.trustScore,
    hasPhone: user.phone !== null,
    suspendedAt: user.suspendedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    reports: user._count.reports,
    rideOffers: user._count.rideOffers,
  };
}
