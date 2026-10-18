import { minutesUntil, tunisClock, upcomingPassages } from '@buslive/shared';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { LiveEvents, type StopPassedEvent } from '../live/live.events';
import { toServiceCalendar } from '../network/network.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

/** Plusieurs passagers du même bus produisent le même passage : on n'en garde qu'un. */
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;
/** Un passage observé est rapproché de l'horaire prévu le plus proche à ± 30 min. */
const SCHEDULE_MATCH_MINUTES = 30;

/**
 * Passages RÉELS des bus aux arrêts, observés grâce au partage en direct.
 * Ils alimentent les statistiques (ponctualité, retard moyen) et servent de
 * preuves automatiques pour les signalements « pas venu » / « bus passé ».
 * Anonymes : aucun lien avec les passagers.
 */
@Injectable()
export class ObservationsService implements OnModuleInit {
  private readonly logger = new Logger(ObservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly liveEvents: LiveEvents,
    private readonly reports: ReportsService,
  ) {}

  onModuleInit(): void {
    this.liveEvents.on('stopPassed', (event) => {
      void this.record(event).catch((error: Error) =>
        this.logger.warn(`Passage observé non enregistré : ${error.message}`),
      );
    });
  }

  async record(event: StopPassedEvent): Promise<void> {
    const recent = await this.prisma.stopPassageObservation.findFirst({
      where: {
        directionId: event.directionId,
        stopId: event.stopId,
        observedAt: {
          gte: new Date(event.observedAt.getTime() - DEDUPE_WINDOW_MS),
          lte: new Date(event.observedAt.getTime() + DEDUPE_WINDOW_MS),
        },
      },
    });
    if (recent) return;

    const match = await this.matchSchedule(event);
    await this.prisma.stopPassageObservation.create({
      data: {
        lineId: event.lineId,
        directionId: event.directionId,
        stopId: event.stopId,
        observedAt: event.observedAt,
        serviceDate: match ? new Date(`${match.serviceDate}T00:00:00Z`) : null,
        scheduledMinutes: match?.passingMinutes ?? null,
        delayMinutes: match?.delayMinutes ?? null,
      },
    });
    await this.reports.applyLiveEvidence(event);
  }

  /**
   * Horaire prévu le plus proche du passage observé (à ± 30 min), et le retard
   * en minutes (positif = en retard, négatif = en avance).
   */
  private async matchSchedule(event: StopPassedEvent) {
    const lineStop = await this.prisma.lineStop.findFirst({
      where: { directionId: event.directionId, stopId: event.stopId },
      select: {
        minutesFromStart: true,
        direction: { select: { departures: { include: { calendar: true } } } },
      },
    });
    if (!lineStop) return null;

    const departures = lineStop.direction.departures;
    const calendars = new Map(departures.map((d) => [d.calendar.code, d.calendar] as const));
    const observedClock = tunisClock(event.observedAt);
    const candidates = upcomingPassages(
      [
        {
          key: event.stopId,
          minutesFromStart: lineStop.minutesFromStart,
          departures: departures.map((d) => ({
            calendarCode: d.calendar.code,
            departureMinutes: d.departureMinutes,
          })),
        },
      ],
      [...calendars.values()].map(toServiceCalendar),
      tunisClock(new Date(event.observedAt.getTime() - SCHEDULE_MATCH_MINUTES * 60_000)),
      { horizonMinutes: 2 * SCHEDULE_MATCH_MINUTES },
    );

    let best: { serviceDate: string; passingMinutes: number; delayMinutes: number } | null = null;
    for (const candidate of candidates) {
      // minutesUntil = prévu − observé : on inverse pour obtenir le retard.
      const delayMinutes = -minutesUntil(candidate, observedClock);
      if (!best || Math.abs(delayMinutes) < Math.abs(best.delayMinutes)) {
        best = {
          serviceDate: candidate.serviceDate,
          passingMinutes: candidate.passingMinutes,
          delayMinutes,
        };
      }
    }
    return best;
  }
}
