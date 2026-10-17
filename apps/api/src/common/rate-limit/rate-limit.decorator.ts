import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOverride {
  /** Nombre de requêtes autorisées par fenêtre (défaut : RATE_LIMIT_MAX). */
  max?: number;
  /** Durée de la fenêtre en secondes (défaut : RATE_LIMIT_WINDOW_SECONDS). */
  windowSeconds?: number;
}

/**
 * Limite le nombre de requêtes par adresse IP sur une route :
 *   @RateLimit()                              → valeurs par défaut du .env
 *   @RateLimit({ max: 20, windowSeconds: 60 }) → valeurs propres à la route
 */
export const RateLimit = (override: RateLimitOverride = {}) =>
  SetMetadata(RATE_LIMIT_KEY, override);
