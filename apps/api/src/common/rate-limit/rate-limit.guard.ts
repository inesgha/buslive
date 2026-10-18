import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { RATE_LIMIT_KEY, type RateLimitOverride } from './rate-limit.decorator';
import { RateLimitStore } from './rate-limit.store';

/** Jeton d'injection des valeurs par défaut (venant du .env, remplaçables dans les tests). */
export const RATE_LIMIT_OPTIONS = 'RATE_LIMIT_OPTIONS';

export interface RateLimitOptions {
  max: number;
  windowSeconds: number;
}

/**
 * Guard global : n'agit que sur les routes marquées @RateLimit().
 * Au-delà de la limite, répond 429 avec l'en-tête standard « Retry-After » (s).
 *
 * Qui compte-t-on ?
 * - utilisateur connecté → PAR UTILISATEUR. Les opérateurs mobiles font souvent
 *   partager une même adresse IP à de nombreux abonnés (CGNAT) : une limite par
 *   IP bloquerait des passagers qui n'ont rien fait ;
 * - sinon (connexion, inscription) → par adresse IP, contre la force brute.
 * Ce guard s'exécute APRÈS JwtAuthGuard (ordre des modules dans AppModule).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: RateLimitStore,
    @Inject(RATE_LIMIT_OPTIONS) private readonly defaults: RateLimitOptions,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const override = this.reflector.getAllAndOverride<RateLimitOverride | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!override) return true;

    const max = override.max ?? this.defaults.max;
    const windowMs = (override.windowSeconds ?? this.defaults.windowSeconds) * 1000;

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: { id: string } }>();
    // Derrière un proxy (phase 11), il faudra activer « trust proxy » pour que
    // request.ip soit l'IP du client et non celle du proxy.
    const who = request.user ? `user:${request.user.id}` : `ip:${request.ip ?? 'inconnue'}`;
    const key = `${context.getClass().name}.${context.getHandler().name}:${who}`;

    const { count, resetAt } = this.store.hit(key, windowMs);
    if (count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      http.getResponse<Response>().setHeader('Retry-After', String(retryAfterSeconds));
      throw new HttpException(
        `Trop de tentatives. Réessaie dans ${retryAfterSeconds} secondes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
