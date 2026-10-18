import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { validateEnv } from './config/env.schema';
import { HealthModule } from './health/health.module';
import { LiveModule } from './live/live.module';
import { NetworkModule } from './network/network.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    // Charge apps/api/.env, valide les variables (zod) et rend ConfigService
    // disponible partout.
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    PrismaModule,
    // L'ordre compte : les guards globaux s'exécutent dans l'ordre des modules.
    // AuthModule d'abord, pour que la limitation compte par utilisateur connecté
    // (voir RateLimitGuard). Vérifier un JWT ne coûte presque rien.
    AuthModule,
    RateLimitModule,
    NetworkModule,
    LiveModule,
    ReportsModule,
    HealthModule,
  ],
})
export class AppModule {}
