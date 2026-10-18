import { z } from 'zod';

import { DirectionSummarySchema, LineBadgeSchema } from './network';
import { ReportSchema } from './reports';

/**
 * Réponse de GET /stops/:id/departures : passages théoriques, bus en direct et
 * signalements d'un arrêt. Fichier séparé de network.ts pour éviter une
 * dépendance circulaire (les signalements utilisent les schémas du réseau).
 */

/** Paramètres de GET /stops/:id/departures. */
export const StopDeparturesQuerySchema = z.object({
  /** Instant de référence (ISO 8601). Par défaut : maintenant. Utile aux tests. */
  at: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});
export type StopDeparturesQuery = z.infer<typeof StopDeparturesQuerySchema>;

/**
 * Un passage prévu à un arrêt. L'heure est ABSOLUE (journée de service +
 * minutes) : l'app calcule elle-même « dans 5 min », ce qui reste juste même
 * si la réponse vient du cache hors ligne.
 */
export const StopPassageSchema = z.object({
  line: LineBadgeSchema.extend({ nameFr: z.string(), nameAr: z.string() }),
  direction: DirectionSummarySchema,
  serviceDate: z.iso.date(),
  passingMinutes: z.number().int().nonnegative(),
});
export type StopPassage = z.infer<typeof StopPassageSchema>;

/**
 * Arrivée EN DIRECT d'un bus à un arrêt, calculée depuis sa position partagée
 * par les passagers (phase 6). Séparée des passages théoriques : on ne devine
 * pas à quel horaire correspond le bus observé.
 */
export const LiveArrivalSchema = z.object({
  vehicleId: z.string(),
  line: LineBadgeSchema.extend({ nameFr: z.string(), nameAr: z.string() }),
  direction: DirectionSummarySchema,
  /** Minutes avant l'arrivée à l'arrêt (0 = à l'arrêt). */
  etaMinutes: z.number().int().nonnegative(),
  /** Dernière position reçue (ISO 8601) : au-delà de 2 min, ne plus afficher. */
  updatedAt: z.iso.datetime(),
});
export type LiveArrival = z.infer<typeof LiveArrivalSchema>;

export const StopDeparturesSchema = z.object({
  stopId: z.uuid(),
  /** Instant de calcul (ISO 8601). */
  generatedAt: z.iso.datetime(),
  /** Bus en direct qui approchent de l'arrêt (vide si aucun passager ne partage). */
  liveArrivals: z.array(LiveArrivalSchema),
  /** Signalements actifs ou confirmés qui concernent l'arrêt (phase 7). */
  reports: z.array(ReportSchema),
  /** Passages théoriques (horaires). */
  passages: z.array(StopPassageSchema),
});
export type StopDepartures = z.infer<typeof StopDeparturesSchema>;
