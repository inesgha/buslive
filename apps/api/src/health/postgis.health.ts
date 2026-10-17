import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';

import { PrismaService } from '../prisma/prisma.service';

/** Délai maximal accordé à la base pour répondre (ms). */
const DB_TIMEOUT_MS = 3000;

/**
 * Indicateur de santé de la base : vérifie que PostgreSQL répond ET que
 * l'extension PostGIS est disponible (indispensable aux requêtes géographiques).
 */
@Injectable()
export class PostgisHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  isHealthy(key = 'database') {
    return this.healthIndicatorService
      .check(key)
      .attempt(async () => {
        // Échoue si PostgreSQL est injoignable ou si PostGIS n'est pas installé.
        const [row] = await this.prisma.$queryRaw<{ postgis: string }[]>`
          SELECT PostGIS_Lib_Version() AS postgis
        `;
        return { postgis: row?.postgis ?? 'inconnue' };
      })
      .withTimeout(DB_TIMEOUT_MS);
  }
}
