import { z } from 'zod';

import { LineBadgeSchema, LineSummarySchema, StopSummarySchema } from './network';

/**
 * Favoris d'un utilisateur connecté : des lignes et des arrêts, synchronisés
 * par l'API (donc retrouvés sur un autre téléphone) et gardés dans le cache
 * hors ligne de l'app.
 */
export const FAVORITE_RULES = {
  /** Nombre maximal de lignes ET d'arrêts favoris (chacun). */
  maxPerKind: 50,
} as const;

export const FavoriteStopSchema = StopSummarySchema.extend({
  /** Lignes qui desservent l'arrêt (pastilles). */
  lines: z.array(LineBadgeSchema),
});
export type FavoriteStop = z.infer<typeof FavoriteStopSchema>;

/** Réponse de GET /me/favorites (seuls les éléments encore visibles sont renvoyés). */
export const FavoritesSchema = z.object({
  lines: z.array(LineSummarySchema),
  stops: z.array(FavoriteStopSchema),
});
export type Favorites = z.infer<typeof FavoritesSchema>;
