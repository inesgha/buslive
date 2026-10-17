import { z } from 'zod';

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
