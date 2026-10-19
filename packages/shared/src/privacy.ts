import { z } from 'zod';

import { PASSWORD_MAX_LENGTH } from './auth';
import { NOTIFICATION_RULES } from './notifications';

/**
 * Durées de conservation des données (jours). Appliquées chaque jour par
 * l'API (RetentionService) et affichées telles quelles dans la politique de
 * confidentialité : une seule source, pas d'écart possible entre les deux.
 */
export const RETENTION_RULES = {
  /** Dernière position d'un partage terminé : effacée après ce délai. */
  liveSessionPositionDays: 7,
  /** Le partage lui-même (ligne, durée, nombre de positions) : supprimé après ce délai. */
  liveSessionDays: 90,
  /** Signalements et votes. */
  reportDays: 365,
  /** Passages de bus observés (anonymes) : base des statistiques. */
  observationDays: 400,
  /** Trajets de covoiturage, après leur date de départ. */
  rideOfferDays: 90,
  /** Sessions de connexion expirées ou révoquées. */
  refreshTokenDays: 30,
  /** Liens « Partager mon trajet », après leur expiration. */
  tripShareDays: 7,
  /** Historique des notifications. */
  notificationDays: NOTIFICATION_RULES.historyDays,
  /** Téléphone qui ne s'est plus manifesté. */
  pushDeviceDays: NOTIFICATION_RULES.deviceInactiveDays,
} as const;

/**
 * Corps de DELETE /me : le mot de passe est redemandé, pour qu'un téléphone
 * laissé ouvert ne suffise pas à supprimer le compte.
 */
export const DeleteAccountSchema = z.object({
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type DeleteAccountInput = z.infer<typeof DeleteAccountSchema>;
