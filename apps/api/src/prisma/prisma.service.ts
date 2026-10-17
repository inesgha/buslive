import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import type { Env } from '../config/env.schema';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Client Prisma partagé par toute l'API.
 * Avec Prisma 7, la connexion passe par un « driver adapter » : ici le pilote
 * PostgreSQL officiel « pg », configuré avec DATABASE_URL.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
    });
  }

  async onModuleInit(): Promise<void> {
    // Pas de « throw » si la base est indisponible au démarrage : l'API démarre
    // quand même et la route /health/ready signale le problème (503).
    try {
      await this.$connect();
      this.logger.log('Connecté à PostgreSQL');
    } catch (error) {
      this.logger.error(`Connexion à PostgreSQL impossible : ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Ferme proprement les connexions quand l'API s'arrête.
    await this.$disconnect();
  }
}
