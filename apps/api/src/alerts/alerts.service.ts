import { ALERT_RULES, type Alert as AlertDto, type AlertInput } from '@buslive/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { VISIBLE_LINE, VISIBLE_STOP } from '../network/network.filters';
import { toDirectionSummary } from '../network/network.mapper';
import { PrismaService } from '../prisma/prisma.service';

const alertInclude = {
  line: { select: { id: true, code: true, color: true, nameFr: true, nameAr: true } },
  direction: true,
  stop: { select: { id: true, nameFr: true, nameAr: true } },
} satisfies Prisma.AlertInclude;

type AlertWithRelations = Prisma.AlertGetPayload<{ include: typeof alertInclude }>;

/**
 * Alerte prête pour le moteur : tout ce qu'il faut pour décider ET rédiger la
 * notification, sans relire la base à chaque position de bus.
 */
export interface WatchedAlert {
  id: string;
  userId: string;
  lineId: string;
  lineCode: string;
  directionId: string;
  headsignFr: string;
  headsignAr: string;
  stopId: string;
  stopNameFr: string;
  stopNameAr: string;
  /** Temps de trajet prévu du terminus à l'arrêt (pour calculer l'arrivée du bus). */
  stopMinutesFromStart: number;
  leadMinutes: number;
  days: number[];
  startMinutes: number;
  endMinutes: number;
  notifyApproach: boolean;
  notifyIncidents: boolean;
}

/** Durée de vie du cache des alertes d'une ligne (filet de sécurité en plus de l'invalidation). */
const CACHE_TTL_MS = 60_000;

/**
 * Alertes « mon trajet » : CRUD pour l'utilisateur, et lecture rapide (cache
 * par ligne) pour le moteur d'alertes. Le cache est vidé à chaque modification.
 * Limite connue : avec plusieurs instances de l'API, chaque instance a son
 * cache (d'où la courte durée de vie) ; Redis en phase 11.
 */
@Injectable()
export class AlertsService {
  private readonly cache = new Map<string, { alerts: WatchedAlert[]; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  // --- Pour l'utilisateur ---------------------------------------------------------

  async list(userId: string): Promise<AlertDto[]> {
    const alerts = await this.prisma.alert.findMany({
      where: { userId },
      include: alertInclude,
      orderBy: { createdAt: 'asc' },
    });
    return alerts.map(toAlertDto);
  }

  async create(userId: string, input: AlertInput): Promise<AlertDto> {
    const count = await this.prisma.alert.count({ where: { userId } });
    if (count >= ALERT_RULES.maxAlertsPerUser) {
      throw new ConflictException(
        `Tu as atteint la limite de ${ALERT_RULES.maxAlertsPerUser} alertes.`,
      );
    }
    await this.validate(input);
    const alert = await this.prisma.alert.create({
      data: { userId, ...normalize(input) },
      include: alertInclude,
    });
    this.invalidate(alert.lineId);
    return toAlertDto(alert);
  }

  async update(userId: string, id: string, input: AlertInput): Promise<AlertDto> {
    const existing = await this.findOwn(userId, id);
    await this.validate(input);
    const alert = await this.prisma.alert.update({
      where: { id },
      data: normalize(input),
      include: alertInclude,
    });
    this.invalidate(existing.lineId, alert.lineId);
    return toAlertDto(alert);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.findOwn(userId, id);
    await this.prisma.alert.delete({ where: { id } });
    this.invalidate(existing.lineId);
  }

  // --- Pour le moteur d'alertes ----------------------------------------------------

  /** Alertes actives (interrupteur allumé) d'une ligne visible. */
  async watchedForLine(lineId: string): Promise<WatchedAlert[]> {
    const cached = this.cache.get(lineId);
    if (cached && cached.expiresAt > Date.now()) return cached.alerts;

    const [alerts, lineStops] = await Promise.all([
      this.prisma.alert.findMany({
        where: { lineId, enabled: true, line: VISIBLE_LINE },
        include: alertInclude,
      }),
      this.prisma.lineStop.findMany({
        where: { direction: { lineId } },
        orderBy: { sequence: 'asc' },
        select: { directionId: true, stopId: true, minutesFromStart: true },
      }),
    ]);
    // Temps de trajet jusqu'à l'arrêt, par sens (premier passage si la ligne fait une boucle).
    const minutesByStop = new Map<string, number>();
    for (const lineStop of lineStops) {
      const key = `${lineStop.directionId}:${lineStop.stopId}`;
      if (!minutesByStop.has(key)) minutesByStop.set(key, lineStop.minutesFromStart);
    }

    const watched: WatchedAlert[] = [];
    for (const alert of alerts) {
      const stopMinutesFromStart = minutesByStop.get(`${alert.directionId}:${alert.stopId}`);
      // L'arrêt ne fait plus partie du parcours : l'alerte ne peut plus se déclencher.
      if (stopMinutesFromStart === undefined) continue;
      watched.push({
        id: alert.id,
        userId: alert.userId,
        lineId: alert.lineId,
        lineCode: alert.line.code,
        directionId: alert.directionId,
        headsignFr: alert.direction.headsignFr,
        headsignAr: alert.direction.headsignAr,
        stopId: alert.stopId,
        stopNameFr: alert.stop.nameFr,
        stopNameAr: alert.stop.nameAr,
        stopMinutesFromStart,
        leadMinutes: alert.leadMinutes,
        days: alert.days,
        startMinutes: alert.startMinutes,
        endMinutes: alert.endMinutes,
        notifyApproach: alert.notifyApproach,
        notifyIncidents: alert.notifyIncidents,
      });
    }
    this.cache.set(lineId, { alerts: watched, expiresAt: Date.now() + CACHE_TTL_MS });
    return watched;
  }

  /**
   * Réserve le droit d'envoyer une notification « bus qui approche » pour cette
   * alerte. La mise à jour CONDITIONNELLE (dernier envoi absent ou assez ancien)
   * est atomique : si deux bus déclenchent en même temps, ou après un
   * redémarrage de l'API, une seule notification part.
   */
  async claimApproach(alertId: string, at: Date): Promise<boolean> {
    const cooldownStart = new Date(at.getTime() - ALERT_RULES.approachCooldownMinutes * 60_000);
    const { count } = await this.prisma.alert.updateMany({
      where: {
        id: alertId,
        enabled: true,
        OR: [{ lastApproachAt: null }, { lastApproachAt: { lt: cooldownStart } }],
      },
      data: { lastApproachAt: at },
    });
    return count === 1;
  }

  // --- Interne ------------------------------------------------------------------------

  private invalidate(...lineIds: string[]): void {
    for (const lineId of lineIds) this.cache.delete(lineId);
  }

  private async findOwn(userId: string, id: string) {
    const alert = await this.prisma.alert.findFirst({ where: { id, userId } });
    // 404 aussi pour l'alerte d'un autre : on ne révèle pas qu'elle existe.
    if (!alert) throw new NotFoundException('Alerte introuvable.');
    return alert;
  }

  /** La ligne est visible et l'arrêt est desservi par CE sens de la ligne. */
  private async validate(input: AlertInput): Promise<void> {
    const line = await this.prisma.line.findFirst({ where: { id: input.lineId, ...VISIBLE_LINE } });
    if (!line) throw new NotFoundException('Ligne introuvable.');
    const direction = await this.prisma.lineDirection.findFirst({
      where: { id: input.directionId, lineId: input.lineId },
    });
    if (!direction) throw new NotFoundException('Sens introuvable pour cette ligne.');
    const stop = await this.prisma.stop.findFirst({
      where: {
        id: input.stopId,
        ...VISIBLE_STOP,
        lineStops: { some: { directionId: input.directionId } },
      },
    });
    if (!stop) throw new NotFoundException('Arrêt introuvable sur ce sens de la ligne.');
  }
}

/** Jours triés : l'ordre de saisie n'a pas d'importance. */
function normalize(input: AlertInput) {
  return { ...input, days: [...input.days].sort((a, b) => a - b) };
}

function toAlertDto(alert: AlertWithRelations): AlertDto {
  return {
    id: alert.id,
    line: alert.line,
    direction: toDirectionSummary(alert.direction),
    stop: alert.stop,
    leadMinutes: alert.leadMinutes,
    days: alert.days,
    startMinutes: alert.startMinutes,
    endMinutes: alert.endMinutes,
    notifyApproach: alert.notifyApproach,
    notifyIncidents: alert.notifyIncidents,
    enabled: alert.enabled,
    createdAt: alert.createdAt.toISOString(),
  };
}
