import { z } from 'zod';

import { DirectionSummarySchema, LineBadgeSchema } from './network';

/**
 * Types de signalement qu'un passager peut envoyer.
 * Les libellés affichés sont traduits côté app (i18n) ; ici on ne garde que
 * des codes stables, stockés tels quels en base.
 */
export const REPORT_TYPES = [
  'NOT_CAME', // le bus n'est pas venu
  'PASSED', // le bus est déjà passé
  'FULL', // le bus est plein
  'DELAYED', // le bus est en retard
  'BREAKDOWN', // le bus est en panne
  'STOP_MOVED', // l'arrêt a été déplacé
] as const;

export const ReportTypeSchema = z.enum(REPORT_TYPES);
export type ReportType = z.infer<typeof ReportTypeSchema>;

/** Types qui concernent un passage précis à un arrêt (« le bus de 07:30 »). */
export const STOP_TIMED_REPORT_TYPES: readonly ReportType[] = ['NOT_CAME', 'PASSED', 'DELAYED'];

export const REPORT_STATUSES = ['ACTIVE', 'CONFIRMED', 'REJECTED', 'EXPIRED'] as const;
export const ReportStatusSchema = z.enum(REPORT_STATUSES);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const VOTE_VALUES = ['CONFIRM', 'DENY'] as const;
export const VoteValueSchema = z.enum(VOTE_VALUES);
export type VoteValue = z.infer<typeof VoteValueSchema>;

/**
 * Corps de POST /reports. Les champs obligatoires dépendent du type :
 * - tous sauf « arrêt déplacé » : le sens ;
 * - pas venu / passé / retard / arrêt déplacé : l'arrêt ;
 * - arrêt déplacé : la position (là où se trouve vraiment l'arrêt) ;
 * - l'horaire concerné (serviceDate + scheduledMinutes) est facultatif, mais complet.
 * Pas de texte libre : rien à modérer, pas de données personnelles.
 */
export const CreateReportSchema = z
  .object({
    type: ReportTypeSchema,
    lineId: z.uuid(),
    directionId: z.uuid().optional(),
    stopId: z.uuid().optional(),
    serviceDate: z.iso.date().optional(),
    scheduledMinutes: z.number().int().min(0).max(2879).optional(),
    delayMinutes: z.number().int().min(1).max(180).optional(),
    position: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracy: z.number().nonnegative(),
      })
      .optional(),
  })
  .superRefine((report, ctx) => {
    const require = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (report.type !== 'STOP_MOVED' && !report.directionId) {
      require('directionId', 'Le sens est obligatoire.');
    }
    if (
      (STOP_TIMED_REPORT_TYPES.includes(report.type) || report.type === 'STOP_MOVED') &&
      !report.stopId
    ) {
      require('stopId', 'L’arrêt est obligatoire.');
    }
    if (report.type === 'STOP_MOVED' && !report.position) {
      require('position', 'La position est obligatoire pour un arrêt déplacé.');
    }
    if ((report.serviceDate === undefined) !== (report.scheduledMinutes === undefined)) {
      require('scheduledMinutes', 'serviceDate et scheduledMinutes vont ensemble.');
    }
    if (report.delayMinutes !== undefined && report.type !== 'DELAYED') {
      require('delayMinutes', 'Le retard ne concerne que les signalements « retard ».');
    }
  });
export type CreateReportInput = z.infer<typeof CreateReportSchema>;

export const VoteInputSchema = z.object({ value: VoteValueSchema });
export type VoteInput = z.infer<typeof VoteInputSchema>;

/** Un signalement tel qu'affiché (aucune information sur son auteur). */
export const ReportSchema = z.object({
  id: z.uuid(),
  type: ReportTypeSchema,
  status: ReportStatusSchema,
  line: LineBadgeSchema.extend({ nameFr: z.string(), nameAr: z.string() }),
  direction: DirectionSummarySchema.nullable(),
  stop: z.object({ id: z.uuid(), nameFr: z.string(), nameAr: z.string() }).nullable(),
  serviceDate: z.iso.date().nullable(),
  scheduledMinutes: z.number().int().nullable(),
  delayMinutes: z.number().int().nullable(),
  /** Confirmations d'autres passagers (l'auteur n'est pas compté). */
  confirmations: z.number().int().nonnegative(),
  denials: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  /** Pour l'utilisateur connecté : est-ce son signalement ? quel est son vote ? */
  mine: z.boolean(),
  myVote: VoteValueSchema.nullable(),
});
export type Report = z.infer<typeof ReportSchema>;

/** Message Socket.io « reports » diffusé dans la room de la ligne. */
export const LineReportEventSchema = z.object({
  lineId: z.uuid(),
  report: ReportSchema,
});
export type LineReportEvent = z.infer<typeof LineReportEventSchema>;
