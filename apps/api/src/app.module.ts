import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { validateEnv } from './config/env.schema';
import { HealthModule } from './health/health.module';
import { NetworkModule } from './network/network.module';
import { PrismaModule } from './prisma/prisma.module';

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
    // Avant AuthModule : une requête trop fréquente est rejetée avant tout autre travail.
    RateLimitModule,
    AuthModule,
    NetworkModule,
    HealthModule,
  ],
})
export class AppModule {}
