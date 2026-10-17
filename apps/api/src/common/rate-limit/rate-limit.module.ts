import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import type { Env } from '../../config/env.schema';
import { RATE_LIMIT_OPTIONS, RateLimitGuard, type RateLimitOptions } from './rate-limit.guard';
import { RateLimitStore } from './rate-limit.store';

/**
 * Limitation du nombre de requêtes (anti force brute), sans dépendance externe.
 * @nestjs/throttler n'est pas utilisable ici : publié en CommonJS, il ne peut pas
 * charger NestJS 12 (ESM) dans Jest sous Node 22.
 */
@Module({
  providers: [
    RateLimitStore,
    {
      provide: RATE_LIMIT_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): RateLimitOptions => ({
        max: config.get('RATE_LIMIT_MAX', { infer: true }),
        windowSeconds: config.get('RATE_LIMIT_WINDOW_SECONDS', { infer: true }),
      }),
    },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class RateLimitModule {}
