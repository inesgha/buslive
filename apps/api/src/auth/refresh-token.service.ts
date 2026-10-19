import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Longueur maximale conservée pour l'en-tête User-Agent (informatif). */
const USER_AGENT_MAX_LENGTH = 255;

export interface IssuedRefreshToken {
  /** Jeton en clair : renvoyé au client, JAMAIS stocké. */
  token: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken extends IssuedRefreshToken {
  userId: string;
}

/** Erreur interne : le jeton a été utilisé par une autre requête entre-temps. */
class ConcurrentRotationError extends Error {}

/**
 * Gestion des refresh tokens :
 * - jeton opaque de 256 bits aléatoires ; seule son empreinte SHA-256 est en base
 *   (un hachage lent comme argon2 est inutile : le jeton n'est pas devinable) ;
 * - rotation à chaque utilisation ;
 * - détection de réutilisation : un jeton déjà remplacé qui revient signale un vol
 *   probable, toute sa famille (la session) est révoquée.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * MS_PER_DAY;
  }

  /** Crée le premier jeton d'une nouvelle session (nouvelle famille). */
  async issue(userId: string, userAgent?: string): Promise<IssuedRefreshToken> {
    const { token, tokenHash } = generateToken();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        familyId: randomUUID(),
        expiresAt,
        userAgent: truncate(userAgent),
      },
    });
    return { token, expiresAt };
  }

  /** Échange un jeton valide contre un nouveau ; lève 401 sinon. */
  async rotate(rawToken: string, userAgent?: string): Promise<RotatedRefreshToken> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!existing) throw invalidToken();

    if (existing.revokedAt) {
      // Jeton déjà utilisé ou révoqué qui revient : vol probable.
      await this.revokeFamily(existing.familyId);
      this.logger.warn(
        `Réutilisation d'un refresh token détectée (utilisateur ${existing.userId}) : session révoquée.`,
      );
      throw invalidToken();
    }

    if (existing.expiresAt <= new Date()) throw invalidToken();

    const { token, tokenHash } = generateToken();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    try {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.refreshToken.create({
          data: {
            userId: existing.userId,
            tokenHash,
            familyId: existing.familyId,
            expiresAt,
            userAgent: truncate(userAgent),
          },
        });
        // Mise à jour conditionnelle (revokedAt encore nul) : si deux requêtes
        // utilisent le même jeton en même temps, une seule gagne.
        const { count } = await tx.refreshToken.updateMany({
          where: { id: existing.id, revokedAt: null },
          data: { revokedAt: new Date(), replacedById: created.id },
        });
        if (count !== 1) throw new ConcurrentRotationError();
      });
    } catch (error) {
      if (error instanceof ConcurrentRotationError) {
        // La transaction a été annulée ; on traite le cas comme une réutilisation.
        await this.revokeFamily(existing.familyId);
        throw invalidToken();
      }
      throw error;
    }

    return { userId: existing.userId, token, expiresAt };
  }

  /** Révoque la session liée à ce jeton (déconnexion). Silencieux si le jeton est inconnu. */
  async revokeSession(rawToken: string): Promise<void> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: { familyId: true },
    });
    if (existing) await this.revokeFamily(existing.familyId);
  }

  /** Révoque TOUTES les sessions d'un utilisateur (compte suspendu). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

/** Empreinte SHA-256 (hexadécimal) d'un jeton : c'est elle qui est stockée. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

function truncate(value: string | undefined): string | undefined {
  return value?.slice(0, USER_AGENT_MAX_LENGTH);
}

function invalidToken(): UnauthorizedException {
  return new UnauthorizedException('Session expirée ou invalide. Reconnecte-toi.');
}
