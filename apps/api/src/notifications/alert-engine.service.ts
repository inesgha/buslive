import {
  ALERT_RULES,
  approachingEta,
  INCIDENT_REPORT_TYPES,
  incidentConcernsAlert,
  isAlertActive,
  TRUST_RULES,
  tunisClock,
} from '@buslive/shared';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { AlertsService } from '../alerts/alerts.service';
import { LiveEvents, type VehiclesUpdatedEvent } from '../live/live.events';
import { PrismaService } from '../prisma/prisma.service';
import { ReportEvents, type ReportResolvedEvent } from '../reports/reports.events';
import { NotificationsService } from './notifications.service';

/**
 * Moteur d'alertes : écoute les bus en direct et les signalements tranchés,
 * et décide qui notifier. Les règles elles-mêmes sont des fonctions pures de
 * @buslive/shared (testées à part) : ici, on ne fait que les appliquer.
 */
@Injectable()
export class AlertEngine implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertEngine.name);

  // Les écouteurs d'EventEmitter sont synchrones : le travail asynchrone est
  // lancé à part, et une erreur est journalisée au lieu de faire tomber l'API.
  private readonly onVehicles = (event: VehiclesUpdatedEvent) => {
    void this.handleVehicles(event).catch((error: Error) =>
      this.logger.warn(`Alertes « bus qui approche » : ${error.message}`),
    );
  };
  private readonly onReportResolved = (event: ReportResolvedEvent) => {
    void this.handleReportResolved(event).catch((error: Error) =>
      this.logger.warn(`Notifications de signalement : ${error.message}`),
    );
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
    private readonly notifications: NotificationsService,
    private readonly liveEvents: LiveEvents,
    private readonly reportEvents: ReportEvents,
  ) {}

  onModuleInit(): void {
    this.liveEvents.on('vehiclesUpdated', this.onVehicles);
    this.reportEvents.on('reportResolved', this.onReportResolved);
  }

  onModuleDestroy(): void {
    this.liveEvents.off('vehiclesUpdated', this.onVehicles);
    this.reportEvents.off('reportResolved', this.onReportResolved);
  }

  /** Un bus en direct arrive bientôt à l'arrêt d'une alerte → « bus qui approche ». */
  async handleVehicles({ lineId, vehicles, at }: VehiclesUpdatedEvent): Promise<void> {
    const alerts = await this.alerts.watchedForLine(lineId);
    if (alerts.length === 0) return;
    const clock = tunisClock(at);

    for (const alert of alerts) {
      if (!alert.notifyApproach || !isAlertActive(alert, clock)) continue;
      const etas = vehicles
        .map((vehicle) => approachingEta(vehicle, alert))
        .filter((eta): eta is number => eta !== null);
      if (etas.length === 0) continue;
      // Anti-spam : au plus une notification par alerte pendant approachCooldownMinutes.
      if (!(await this.alerts.claimApproach(alert.id, at))) continue;

      await this.notifications.notify(
        alert.userId,
        {
          type: 'BUS_APPROACHING',
          data: {
            lineId,
            lineCode: alert.lineCode,
            directionId: alert.directionId,
            headsignFr: alert.headsignFr,
            headsignAr: alert.headsignAr,
            stopId: alert.stopId,
            stopNameFr: alert.stopNameFr,
            stopNameAr: alert.stopNameAr,
            // Le premier bus à arriver ; jamais « dans 0 min ».
            etaMinutes: Math.max(1, Math.round(Math.min(...etas))),
          },
        },
        `approach:${alert.id}:${at.getTime()}`,
      );
    }
  }

  /**
   * Un signalement est tranché : son auteur est prévenu (s'il le souhaite) et,
   * s'il est confirmé, les abonnés du trajet concerné aussi.
   */
  async handleReportResolved({ reportId, status, resolvedAt }: ReportResolvedEvent): Promise<void> {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        line: { select: { code: true } },
        direction: { select: { headsignFr: true, headsignAr: true } },
        stop: { select: { nameFr: true, nameAr: true } },
        user: { select: { notifyReportOutcome: true } },
        votes: { select: { userId: true } },
      },
    });
    if (!report) return;

    // 1. L'auteur : points réellement versés (le score peut être plafonné).
    if (report.user.notifyReportOutcome) {
      const reason = status === 'CONFIRMED' ? 'REPORT_CONFIRMED' : 'REPORT_REJECTED';
      const event = await this.prisma.trustEvent.findFirst({
        where: { reportId, userId: report.userId, reason },
        select: { delta: true },
      });
      await this.notifications.notify(
        report.userId,
        {
          type: 'REPORT_RESOLVED',
          data: {
            reportId,
            lineId: report.lineId,
            lineCode: report.line.code,
            status,
            points: event?.delta ?? TRUST_RULES.points[reason],
          },
        },
        `report:${reportId}`,
      );
    }

    // 2. Les abonnés, seulement pour une perturbation CONFIRMÉE.
    if (status !== 'CONFIRMED' || !INCIDENT_REPORT_TYPES.includes(report.type)) return;
    const alerts = await this.alerts.watchedForLine(report.lineId);
    const clock = tunisClock(resolvedAt);
    // L'auteur et ceux qui ont voté sont déjà au courant.
    const informed = new Set<string>([
      report.userId,
      ...report.votes.flatMap((vote) => (vote.userId ? [vote.userId] : [])),
    ]);

    for (const alert of alerts) {
      if (informed.has(alert.userId) || !alert.notifyIncidents) continue;
      if (!incidentConcernsAlert(report, alert)) continue;
      if (!isAlertActive(alert, clock, ALERT_RULES.incidentLookaheadMinutes)) continue;
      // Un abonné avec deux alertes concernées ne reçoit qu'une notification.
      informed.add(alert.userId);
      await this.notifications.notify(
        alert.userId,
        {
          type: 'LINE_INCIDENT',
          data: {
            reportId,
            reportType: report.type,
            lineId: report.lineId,
            lineCode: report.line.code,
            headsignFr: report.direction?.headsignFr ?? null,
            headsignAr: report.direction?.headsignAr ?? null,
            stopNameFr: report.stop?.nameFr ?? null,
            stopNameAr: report.stop?.nameAr ?? null,
            delayMinutes: report.delayMinutes,
          },
        },
        `incident:${reportId}`,
      );
    }
  }
}
