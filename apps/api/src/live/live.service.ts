import {
  distanceMeters,
  etaMinutes,
  isInTunisia,
  isSpeedPlausible,
  LIVE_RULES,
  type LiveArrival,
  type LiveSession as LiveSessionDto,
  type LiveSessionEndReason,
  type PositionBatch,
  type PositionBatchResult,
  type PositionSample,
  progressMinutes,
  projectOnRoute,
  type StartLiveSessionInput,
} from '@buslive/shared';
import {
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import type { LiveSession } from '../generated/prisma/client';
import { VISIBLE_LINE } from '../network/network.filters';
import { PrismaService } from '../prisma/prisma.service';
import { LiveBroadcaster } from './live.broadcaster';
import { type ActiveSharer, LiveRegistry } from './live.registry';
import { type RouteData, RouteCacheService } from './route-cache.service';

/** Fréquence du ménage des partages inactifs ou trop longs. */
const SWEEP_INTERVAL_MS = 60_000;
/** Âge maximal d'une position reçue (une position trop ancienne n'a plus d'intérêt). */
const MAX_POSITION_AGE_MS = 10 * 60 * 1000;
/** Tolérance d'horloge du téléphone (une position « dans le futur »). */
const MAX_CLOCK_SKEW_MS = 60 * 1000;

/** Un sens de ligne qui dessert un arrêt (pour calculer les arrivées en direct). */
export interface StopServing {
  lineId: string;
  directionId: string;
  minutesFromStart: number;
  line: LiveArrival['line'];
  direction: LiveArrival['direction'];
}

/**
 * « Je suis dans le bus » : démarrage, positions, arrêt des partages, et bus en
 * direct qui en découlent.
 */
@Injectable()
export class LiveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveService.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly routes: RouteCacheService,
    private readonly registry: LiveRegistry,
    private readonly broadcaster: LiveBroadcaster,
  ) {}

  async onModuleInit(): Promise<void> {
    // Le registre est en mémoire : après un redémarrage de l'API, les partages
    // encore marqués « en cours » en base sont perdus. On les clôt proprement.
    try {
      await this.prisma.liveSession.updateMany({
        where: { status: 'ACTIVE' },
        data: { status: 'ENDED', endReason: 'INACTIVE', endedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(`Nettoyage des partages impossible : ${(error as Error).message}`);
    }
    this.sweepTimer = setInterval(() => void this.sweep(Date.now()), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /** Commence un partage. Un éventuel partage précédent de l'utilisateur est clos. */
  async start(userId: string, input: StartLiveSessionInput): Promise<LiveSessionDto> {
    const direction = await this.prisma.lineDirection.findFirst({
      where: { id: input.directionId, lineId: input.lineId, line: VISIBLE_LINE },
      select: { id: true },
    });
    if (!direction) throw new NotFoundException('Ligne ou sens introuvable.');
    await this.routes.get(input.directionId); // vérifie que le parcours est exploitable

    for (const previous of this.registry.all().filter((s) => s.userId === userId)) {
      await this.endSession(previous.sessionId, 'REPLACED');
    }
    await this.prisma.liveSession.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'ENDED', endReason: 'REPLACED', endedAt: new Date() },
    });

    const session = await this.prisma.liveSession.create({
      data: { userId, lineId: input.lineId, directionId: input.directionId },
    });
    this.registry.add({
      sessionId: session.id,
      userId,
      lineId: session.lineId,
      directionId: session.directionId,
      startedAt: session.startedAt.getTime(),
      last: null,
    });
    return toDto(session);
  }

  /**
   * Reçoit un lot de positions. Chaque position est vérifiée (âge, précision,
   * Tunisie, intervalle, vitesse, distance au parcours) ; seules les positions
   * plausibles font avancer le bus.
   */
  async addPositions(
    userId: string,
    sessionId: string,
    batch: PositionBatch,
    now = new Date(),
  ): Promise<PositionBatchResult> {
    const sharer = this.registry.get(sessionId);
    if (!sharer || sharer.userId !== userId) {
      // Partage déjà terminé (ex. arrivé au terminus) : on le signale à l'app.
      const ended = await this.findOwnSession(userId, sessionId);
      return {
        accepted: 0,
        rejected: batch.points.length,
        onRoute: false,
        sharersOnVehicle: 0,
        session: toDto(ended),
      };
    }

    const route = await this.routes.get(sharer.directionId);
    const points = [...batch.points].sort(
      (a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt),
    );
    let accepted = 0;
    let onRoute = false;
    for (const sample of points) {
      const verdict = this.evaluate(sharer, sample, route, now.getTime());
      onRoute = verdict.onRoute;
      if (verdict.accept) {
        sharer.last = verdict.state;
        accepted++;
      }
    }
    const rejected = points.length - accepted;

    let session = await this.prisma.liveSession.update({
      where: { id: sessionId },
      data: {
        acceptedPositions: { increment: accepted },
        rejectedPositions: { increment: rejected },
        ...(accepted > 0 &&
          sharer.last && {
            lastLatitude: sharer.last.position.latitude,
            lastLongitude: sharer.last.position.longitude,
            lastPositionAt: new Date(sharer.last.recordedAt),
          }),
      },
    });
    const sharersOnVehicle = this.registry.sharersOnSameVehicle(sessionId, now.getTime());

    if (accepted > 0) {
      this.broadcaster.schedule(sharer.lineId);
      if (sharer.last && this.reachedTerminus(sharer.last, route)) {
        session = await this.endSession(sessionId, 'TERMINUS');
      }
    }

    return { accepted, rejected, onRoute, sharersOnVehicle, session: toDto(session) };
  }

  /** Arrêt du partage à la demande de l'utilisateur. */
  async end(userId: string, sessionId: string): Promise<LiveSessionDto> {
    const session = await this.findOwnSession(userId, sessionId);
    if (session.status === 'ENDED') return toDto(session);
    return toDto(await this.endSession(sessionId, 'USER'));
  }

  /** Bus en direct d'une ligne. */
  lineVehicles(lineId: string) {
    return this.registry.lineVehicles(lineId, Date.now());
  }

  /** Bus en direct qui approchent d'un arrêt, du plus proche au plus lointain. */
  arrivalsAtStop(servings: readonly StopServing[], now = Date.now()): LiveArrival[] {
    const arrivals: LiveArrival[] = [];
    for (const serving of servings) {
      for (const vehicle of this.registry.vehicleGroups(serving.lineId, now)) {
        if (vehicle.directionId !== serving.directionId) continue;
        const eta = etaMinutes(vehicle.progressMinutes, serving.minutesFromStart);
        if (eta === null) continue; // bus déjà passé
        arrivals.push({
          vehicleId: vehicle.id,
          line: serving.line,
          direction: serving.direction,
          etaMinutes: eta,
          updatedAt: new Date(vehicle.updatedAt).toISOString(),
        });
      }
    }
    return arrivals.sort((a, b) => a.etaMinutes - b.etaMinutes);
  }

  /** Clôt les partages sans position récente ou trop longs. */
  async sweep(now: number): Promise<void> {
    for (const sharer of this.registry.all()) {
      const lastActivity = sharer.last?.recordedAt ?? sharer.startedAt;
      if (now - sharer.startedAt > LIVE_RULES.maxDurationMinutes * 60_000) {
        await this.endSession(sharer.sessionId, 'MAX_DURATION');
      } else if (now - lastActivity > LIVE_RULES.inactiveAfterMinutes * 60_000) {
        await this.endSession(sharer.sessionId, 'INACTIVE');
      }
    }
  }

  private evaluate(sharer: ActiveSharer, sample: PositionSample, route: RouteData, now: number) {
    const at = Date.parse(sample.recordedAt);
    const point = { latitude: sample.latitude, longitude: sample.longitude };
    const projection = projectOnRoute(point, route.shape);
    const onRoute = projection.distanceToRouteMeters <= LIVE_RULES.maxDistanceToRouteMeters;
    const last = sharer.last;

    const accept =
      at <= now + MAX_CLOCK_SKEW_MS &&
      now - at <= MAX_POSITION_AGE_MS &&
      sample.accuracy <= LIVE_RULES.maxAccuracyMeters &&
      isInTunisia(point) &&
      onRoute &&
      (!last || at - last.recordedAt >= LIVE_RULES.minIntervalSeconds * 1000) &&
      (!last || isSpeedPlausible({ point: last.position, at: last.recordedAt }, { point, at }));

    return {
      accept,
      onRoute,
      state: {
        position: point,
        recordedAt: at,
        distanceAlongMeters: projection.distanceAlongMeters,
        progressMinutes: progressMinutes(projection.distanceAlongMeters, route.milestones),
      },
    };
  }

  private reachedTerminus(last: NonNullable<ActiveSharer['last']>, route: RouteData): boolean {
    return (
      distanceMeters(last.position, route.terminus) <= LIVE_RULES.terminusRadiusMeters &&
      last.progressMinutes >= route.terminus.minutesFromStart - 1
    );
  }

  private async endSession(sessionId: string, reason: LiveSessionEndReason): Promise<LiveSession> {
    const sharer = this.registry.remove(sessionId);
    const session = await this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { status: 'ENDED', endReason: reason, endedAt: new Date() },
    });
    this.broadcaster.schedule(sharer?.lineId ?? session.lineId);
    return session;
  }

  private async findOwnSession(userId: string, sessionId: string): Promise<LiveSession> {
    const session = await this.prisma.liveSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Partage introuvable.');
    return session;
  }
}

function toDto(session: LiveSession): LiveSessionDto {
  return {
    id: session.id,
    lineId: session.lineId,
    directionId: session.directionId,
    status: session.status,
    endReason: session.endReason,
    startedAt: session.startedAt.toISOString(),
  };
}
