import { z } from 'zod';

import type { ServiceClock } from './clock';
import { DirectionSummarySchema, LineBadgeSchema } from './network';
import type { ReportType } from './reports';

/**
 * Alertes « mon trajet » : une ligne, un sens, un arrêt et une plage horaire.
 * Elles déclenchent deux sortes de notifications :
 * - « bus qui approche » : un bus EN DIRECT (partagé par des passagers) arrive
 *   à l'arrêt dans moins de « leadMinutes » ;
 * - « perturbation » : un signalement CONFIRMÉ touche ce trajet.
 * On ne notifie jamais à partir des horaires théoriques (peu fiables).
 */
export const ALERT_RULES = {
  maxAlertsPerUser: 10,
  /** Délais proposés pour « le bus arrive dans … » (minutes). */
  leadMinutesOptions: [5, 10, 15],
  defaultLeadMinutes: 10,
  /** Au plus une notification « approche » par alerte pendant ce délai (minutes). */
  approachCooldownMinutes: 30,
  /**
   * Une perturbation compte dès ce délai AVANT le début de la plage (minutes) :
   * une panne à 06:45 intéresse le trajet de 07:00.
   */
  incidentLookaheadMinutes: 60,
} as const;

/** Jours ISO 8601 : 1 = lundi … 7 = dimanche. */
export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Corps de POST /me/alerts et PUT /me/alerts/:id. */
export const AlertInputSchema = z
  .object({
    lineId: z.uuid(),
    directionId: z.uuid(),
    stopId: z.uuid(),
    leadMinutes: z.literal(ALERT_RULES.leadMinutesOptions),
    days: z
      .array(z.number().int().min(1).max(7))
      .min(1, 'Choisis au moins un jour.')
      .max(7)
      .refine((days) => new Set(days).size === days.length, 'Jour en double.'),
    /** Plage horaire en minutes depuis minuit (heure de Tunis), fin exclue de la veille. */
    startMinutes: z.number().int().min(0).max(1439),
    endMinutes: z.number().int().min(1).max(1440),
    notifyApproach: z.boolean(),
    notifyIncidents: z.boolean(),
    enabled: z.boolean(),
  })
  .refine((alert) => alert.startMinutes < alert.endMinutes, {
    path: ['endMinutes'],
    message: 'La fin doit être après le début.',
  })
  .refine((alert) => alert.notifyApproach || alert.notifyIncidents, {
    path: ['notifyApproach'],
    message: 'Choisis au moins un type de notification.',
  });
export type AlertInput = z.infer<typeof AlertInputSchema>;

/** Une alerte telle que renvoyée par l'API. */
export const AlertSchema = z.object({
  id: z.uuid(),
  line: LineBadgeSchema.extend({ nameFr: z.string(), nameAr: z.string() }),
  direction: DirectionSummarySchema,
  stop: z.object({ id: z.uuid(), nameFr: z.string(), nameAr: z.string() }),
  leadMinutes: z.number().int(),
  days: z.array(z.number().int().min(1).max(7)),
  startMinutes: z.number().int(),
  endMinutes: z.number().int(),
  notifyApproach: z.boolean(),
  notifyIncidents: z.boolean(),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type Alert = z.infer<typeof AlertSchema>;

// --- Règles (fonctions pures, partagées par l'API et l'app) ---------------------

/** « 2026-10-19 » (un lundi) → 1. Calculé en UTC : indépendant du fuseau de l'appareil. */
export function isoWeekday(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  const weekday = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export interface AlertWindow {
  days: readonly number[];
  startMinutes: number;
  endMinutes: number;
}

/**
 * L'alerte est-elle active à cette heure de Tunis ? « lookaheadMinutes » avance
 * le début de la plage (utilisé pour les perturbations).
 */
export function isAlertActive(
  window: AlertWindow,
  clock: ServiceClock,
  lookaheadMinutes = 0,
): boolean {
  if (!window.days.includes(isoWeekday(clock.isoDate))) return false;
  return (
    clock.minutes >= window.startMinutes - lookaheadMinutes && clock.minutes <= window.endMinutes
  );
}

/**
 * Minutes avant l'arrivée d'un bus en direct à l'arrêt de l'alerte, s'il faut
 * prévenir (même sens, pas encore passé, arrivée dans « leadMinutes » au plus).
 * Sinon null.
 */
export function approachingEta(
  vehicle: { directionId: string; progressMinutes: number },
  alert: { directionId: string; stopMinutesFromStart: number; leadMinutes: number },
): number | null {
  if (vehicle.directionId !== alert.directionId) return null;
  const eta = alert.stopMinutesFromStart - vehicle.progressMinutes;
  return eta > 0 && eta <= alert.leadMinutes ? eta : null;
}

/** Types de signalement qui donnent lieu à une notification « perturbation ». */
export const INCIDENT_REPORT_TYPES: readonly ReportType[] = [
  'NOT_CAME',
  'PASSED',
  'DELAYED',
  'BREAKDOWN',
  'STOP_MOVED',
];

/**
 * Un signalement confirmé concerne-t-il le trajet de l'alerte ?
 * - pas venu, retard, panne : tout le sens est touché ;
 * - bus passé : seulement l'arrêt concerné ;
 * - arrêt déplacé : l'arrêt, quel que soit le sens.
 * « Plein » n'est pas notifié : c'est trop passager pour valoir une alerte.
 */
export function incidentConcernsAlert(
  report: { type: ReportType; directionId: string | null; stopId: string | null },
  alert: { directionId: string; stopId: string },
): boolean {
  switch (report.type) {
    case 'NOT_CAME':
    case 'DELAYED':
    case 'BREAKDOWN':
      return report.directionId === alert.directionId;
    case 'PASSED':
      return report.directionId === alert.directionId && report.stopId === alert.stopId;
    case 'STOP_MOVED':
      return report.stopId === alert.stopId;
    default:
      return false;
  }
}
