import {
  type CalendarRule,
  type CreateReportInput,
  CreateReportSchema,
  type DirectionDetail,
  type ReportType,
  tunisClock,
  type UpcomingPassage,
  upcomingPassages,
} from '@buslive/shared';

/**
 * Logique du formulaire « Signaler », sans interface (testable) :
 * quelles étapes selon le type, quels horaires proposer, et construction de
 * la requête validée par le schéma partagé.
 */

export type ReportStep = 'type' | 'line' | 'stop' | 'passage' | 'delay';

/** Étapes nécessaires selon le type de signalement. */
export function stepsFor(type: ReportType): ReportStep[] {
  switch (type) {
    case 'NOT_CAME':
    case 'PASSED':
      return ['type', 'line', 'stop', 'passage'];
    case 'DELAYED':
      return ['type', 'line', 'stop', 'passage', 'delay'];
    case 'STOP_MOVED':
      return ['type', 'line', 'stop'];
    default: // FULL, BREAKDOWN : la ligne et le sens suffisent
      return ['type', 'line'];
  }
}

export interface ReportDraft {
  type?: ReportType;
  lineId?: string;
  directionId?: string;
  stopId?: string;
  /** Horaire concerné ; null = « je ne sais pas ». */
  passage?: { serviceDate: string; passingMinutes: number } | null;
  delayMinutes?: number;
}

/** Retards proposés (minutes). */
export const DELAY_OPTIONS = [5, 10, 15, 30] as const;

/** Fenêtre des horaires proposés : de 60 min avant à 30 min après maintenant. */
const PASSAGES_BEFORE_MINUTES = 60;
const PASSAGES_AFTER_MINUTES = 30;

/** Horaires proposés pour un arrêt (heure de passage à cet arrêt, heure de Tunis). */
export function passageChoices(
  direction: Pick<DirectionDetail, 'stops' | 'departures'>,
  calendars: readonly CalendarRule[],
  stopId: string,
  now = new Date(),
): UpcomingPassage<string>[] {
  const lineStop = direction.stops.find((s) => s.stop.id === stopId);
  if (!lineStop) return [];
  return upcomingPassages(
    [
      {
        key: stopId,
        minutesFromStart: lineStop.minutesFromStart,
        departures: direction.departures,
      },
    ],
    calendars,
    tunisClock(new Date(now.getTime() - PASSAGES_BEFORE_MINUTES * 60_000)),
    { horizonMinutes: PASSAGES_BEFORE_MINUTES + PASSAGES_AFTER_MINUTES },
  );
}

/**
 * Brouillon → corps de POST /reports, ou null s'il manque quelque chose.
 * La position n'est envoyée que si elle est connue (l'API n'en garde que la
 * distance à l'arrêt ; pour « arrêt déplacé », elle devient la position proposée).
 */
export function buildReportInput(
  draft: ReportDraft,
  position?: { latitude: number; longitude: number; accuracy: number },
): CreateReportInput | null {
  if (!draft.type || !draft.lineId) return null;
  const steps = stepsFor(draft.type);
  const candidate = {
    type: draft.type,
    lineId: draft.lineId,
    directionId: draft.type === 'STOP_MOVED' ? undefined : draft.directionId,
    stopId: steps.includes('stop') ? draft.stopId : undefined,
    ...(steps.includes('passage') &&
      draft.passage && {
        serviceDate: draft.passage.serviceDate,
        scheduledMinutes: draft.passage.passingMinutes,
      }),
    ...(draft.type === 'DELAYED' && draft.delayMinutes && { delayMinutes: draft.delayMinutes }),
    ...(position && { position }),
  };
  const parsed = CreateReportSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
