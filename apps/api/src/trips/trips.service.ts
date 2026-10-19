import { createHash, randomBytes } from 'node:crypto';

import {
  type CreateTripShareInput,
  LIVE_RULES,
  type TripShare as TripShareDto,
  type TripShareCreated,
  tripShareExpiry,
  type TripStatus,
  type TripStatusValue,
} from '@buslive/shared';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import type { LiveSession, TripShare } from '../generated/prisma/client';
import { LiveEvents, type StopPassedEvent } from '../live/live.events';
import { LiveRegistry } from '../live/live.registry';
import { RouteCacheService } from '../live/route-cache.service';
import { PrismaService } from '../prisma/prisma.service';

/** Liens actifs au plus par partage de position. */
const MAX_SHARES_PER_SESSION = 5;

/** Empreinte stockée en base : le jeton lui-même n'y est jamais écrit. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * « Partager mon trajet » : lien secret vers une page de suivi. Le jeton
 * (192 bits aléatoires) n'est donné qu'une fois, à la création ; la base n'en
 * garde que l'empreinte, comme pour les refresh tokens.
 */
@Injectable()
export class TripsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TripsService.name);
  private readonly onStopPassed = (event: StopPassedEvent) => {
    void this.markArrived(event).catch((error: Error) =>
      this.logger.warn(`Arrivée d'un trajet partagé : ${error.message}`),
    );
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: LiveRegistry,
    private readonly routes: RouteCacheService,
    private readonly events: LiveEvents,
  ) {}

  onModuleInit(): void {
    this.events.on('stopPassed', this.onStopPassed);
  }

  onModuleDestroy(): void {
    this.events.off('stopPassed', this.onStopPassed);
  }

  async create(
    userId: string,
    input: CreateTripShareInput,
    now = new Date(),
  ): Promise<TripShareCreated> {
    const session = await this.prisma.liveSession.findFirst({
      where: { id: input.sessionId, userId },
    });
    if (!session) throw new NotFoundException('Partage introuvable.');
    if (session.status !== 'ACTIVE') throw new ConflictException('Ce partage est terminé.');

    const route = await this.routes.get(session.directionId);
    if (!route.stops.some((stop) => stop.stopId === input.destinationStopId)) {
      throw new NotFoundException('Cet arrêt n’est pas sur le parcours.');
    }
    const active = await this.prisma.tripShare.count({
      where: { sessionId: session.id, revokedAt: null },
    });
    if (active >= MAX_SHARES_PER_SESSION) {
      throw new ConflictException('Trop de liens pour ce trajet : supprime-en un.');
    }

    const token = randomBytes(24).toString('base64url');
    const share = await this.prisma.tripShare.create({
      data: {
        userId,
        sessionId: session.id,
        destinationStopId: input.destinationStopId,
        tokenHash: hashToken(token),
        createdAt: now,
      },
      include: { destinationStop: true },
    });
    return { ...toDto(share, share.destinationStop, session), path: `/t/${token}` };
  }

  /** Mes liens encore valables. */
  async listMine(userId: string, now = new Date()): Promise<TripShareDto[]> {
    const shares = await this.prisma.tripShare.findMany({
      where: { userId, revokedAt: null },
      include: { destinationStop: true, session: true },
      orderBy: { createdAt: 'desc' },
    });
    return shares
      .filter((share) => tripShareExpiry(share.createdAt, share.session.endedAt) > now)
      .map((share) => toDto(share, share.destinationStop, share.session));
  }

  async revoke(userId: string, id: string, now = new Date()): Promise<void> {
    const { count } = await this.prisma.tripShare.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: now },
    });
    if (count === 0) {
      const exists = await this.prisma.tripShare.findFirst({ where: { id, userId } });
      if (!exists) throw new NotFoundException('Lien introuvable.');
    }
  }

  /**
   * Ce que voit la personne qui a reçu le lien. AUCUNE donnée personnelle :
   * ni nom, ni téléphone, ni positions — seulement l'avancée du bus sur le parcours.
   * Lien inconnu, révoqué ou expiré : la même erreur 404 (on ne révèle rien).
   */
  async status(token: string, now = new Date()): Promise<TripStatus> {
    const share = await this.prisma.tripShare.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        destinationStop: true,
        session: { include: { line: true, direction: true } },
      },
    });
    const expiresAt = share ? tripShareExpiry(share.createdAt, share.session.endedAt) : null;
    if (!share || !expiresAt || share.revokedAt || expiresAt <= now) {
      throw new NotFoundException('Ce lien de suivi a expiré ou n’existe pas.');
    }

    const { session } = share;
    const route = await this.routes.get(session.directionId);
    const destinationIndex = route.stops.findIndex(
      (stop) => stop.stopId === share.destinationStopId,
    );
    const routeStops = route.stops.slice(0, destinationIndex + 1);
    const names = new Map(
      (
        await this.prisma.stop.findMany({
          where: { id: { in: routeStops.map((stop) => stop.stopId) } },
          select: { id: true, nameFr: true, nameAr: true },
        })
      ).map((stop) => [stop.id, stop]),
    );
    const destinationMinutes = routeStops.at(-1)?.minutesFromStart ?? 0;

    // Position en mémoire (partage en cours) : avancée sur le parcours.
    const last = this.registry.get(session.id)?.last ?? null;
    const status = tripStatus(share, session, last, now);
    const progress = status === 'ARRIVED' ? destinationMinutes : (last?.progressMinutes ?? null);
    const live = status === 'LIVE' || status === 'STALE';

    return {
      status,
      line: {
        code: session.line.code,
        color: session.line.color,
        nameFr: session.line.nameFr,
        nameAr: session.line.nameAr,
      },
      direction: {
        headsignFr: session.direction.headsignFr,
        headsignAr: session.direction.headsignAr,
      },
      destination: { nameFr: share.destinationStop.nameFr, nameAr: share.destinationStop.nameAr },
      stops: routeStops.map((stop) => ({
        nameFr: names.get(stop.stopId)?.nameFr ?? '',
        nameAr: names.get(stop.stopId)?.nameAr ?? '',
        minutesFromStart: stop.minutesFromStart,
        passed: progress !== null && progress >= stop.minutesFromStart,
      })),
      etaMinutes:
        live && progress !== null ? Math.max(0, Math.round(destinationMinutes - progress)) : null,
      updatedAt: last
        ? new Date(last.recordedAt).toISOString()
        : (session.lastPositionAt?.toISOString() ?? null),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Le bus vient de passer un arrêt : arrivé, pour les liens dont c'est l'arrêt de descente. */
  private async markArrived(event: StopPassedEvent): Promise<void> {
    await this.prisma.tripShare.updateMany({
      where: { sessionId: event.sessionId, destinationStopId: event.stopId, arrivedAt: null },
      data: { arrivedAt: event.observedAt },
    });
  }
}

function tripStatus(
  share: TripShare,
  session: LiveSession,
  last: { recordedAt: number } | null,
  now: Date,
): TripStatusValue {
  if (share.arrivedAt) return 'ARRIVED';
  if (session.status === 'ENDED') {
    // Arrivé au terminus : tous les arrêts du parcours ont été dépassés.
    return session.endReason === 'TERMINUS' ? 'ARRIVED' : 'ENDED';
  }
  if (!last || now.getTime() - last.recordedAt > LIVE_RULES.staleAfterSeconds * 1000) {
    return 'STALE';
  }
  return 'LIVE';
}

function toDto(
  share: TripShare,
  stop: { id: string; nameFr: string; nameAr: string },
  session: Pick<LiveSession, 'endedAt'>,
): TripShareDto {
  return {
    id: share.id,
    sessionId: share.sessionId,
    destination: { id: stop.id, nameFr: stop.nameFr, nameAr: stop.nameAr },
    expiresAt: tripShareExpiry(share.createdAt, session.endedAt).toISOString(),
  };
}
