import { z } from 'zod';

/**
 * « Partager mon trajet » : pendant un partage « Je suis dans le bus », le
 * passager envoie à un proche un lien secret qui montre l'avancée du bus et
 * l'arrivée estimée à son arrêt de descente. Le lien n'affiche JAMAIS le nom,
 * le téléphone ni l'historique des positions du passager.
 */
export const TRIP_SHARE_RULES = {
  /** Un lien expire au plus tard 3 h après sa création… */
  maxHours: 3,
  /** … et 15 min après la fin du partage de position. */
  graceMinutesAfterEnd: 15,
  /** La page de suivi se met à jour toutes les 10 s. */
  refreshSeconds: 10,
} as const;

/** Corps de POST /trips. */
export const CreateTripShareSchema = z.object({
  sessionId: z.uuid(),
  destinationStopId: z.uuid(),
});
export type CreateTripShareInput = z.infer<typeof CreateTripShareSchema>;

const StopNameSchema = z.object({ id: z.uuid(), nameFr: z.string(), nameAr: z.string() });

/** Un lien actif (sans son jeton : seule son empreinte est gardée par l'API). */
export const TripShareSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  destination: StopNameSchema,
  expiresAt: z.iso.datetime(),
});
export type TripShare = z.infer<typeof TripShareSchema>;

/** Réponse de POST /trips : le chemin du lien (avec le jeton) n'est donné qu'une fois. */
export const TripShareCreatedSchema = TripShareSchema.extend({
  /** Chemin de la page de suivi, ex. « /t/9f2c… », à ajouter à l'adresse du serveur. */
  path: z.string().startsWith('/t/'),
});
export type TripShareCreated = z.infer<typeof TripShareCreatedSchema>;

export const TRIP_STATUSES = [
  'LIVE', // le bus avance, position récente
  'STALE', // plus de position récente (réseau perdu…)
  'ARRIVED', // le bus a atteint l'arrêt de descente
  'ENDED', // le partage s'est arrêté avant l'arrêt de descente
] as const;
export const TripStatusValueSchema = z.enum(TRIP_STATUSES);
export type TripStatusValue = z.infer<typeof TripStatusValueSchema>;

/** Réponse PUBLIQUE de GET /trips/:token (lue par la page de suivi). */
export const TripStatusSchema = z.object({
  status: TripStatusValueSchema,
  line: z.object({ code: z.string(), color: z.string(), nameFr: z.string(), nameAr: z.string() }),
  direction: z.object({ headsignFr: z.string(), headsignAr: z.string() }),
  destination: z.object({ nameFr: z.string(), nameAr: z.string() }),
  /** Arrêts du parcours jusqu'à l'arrêt de descente compris. */
  stops: z.array(
    z.object({
      nameFr: z.string(),
      nameAr: z.string(),
      minutesFromStart: z.number().int().nonnegative(),
      passed: z.boolean(),
    }),
  ),
  /** Minutes avant l'arrivée à l'arrêt de descente (null si inconnu ou arrivé). */
  etaMinutes: z.number().int().nonnegative().nullable(),
  /** Dernière position reçue. */
  updatedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime(),
});
export type TripStatus = z.infer<typeof TripStatusSchema>;

/** Fin de validité d'un lien : 3 h après sa création, ou 15 min après la fin du partage. */
export function tripShareExpiry(createdAt: Date, sessionEndedAt: Date | null): Date {
  const max = createdAt.getTime() + TRIP_SHARE_RULES.maxHours * 60 * 60_000;
  if (!sessionEndedAt) return new Date(max);
  return new Date(
    Math.min(max, sessionEndedAt.getTime() + TRIP_SHARE_RULES.graceMinutesAfterEnd * 60_000),
  );
}
