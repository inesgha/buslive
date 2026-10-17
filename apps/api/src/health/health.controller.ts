import type { LivenessResponse } from '@buslive/shared';
import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

import { PostgisHealthIndicator } from './postgis.health';

@ApiTags('Santé')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgis: PostgisHealthIndicator,
  ) {}

  /**
   * « Liveness » : le processus répond. Ne touche pas à la base, pour qu'une
   * panne de base ne provoque pas de redémarrages en boucle de l'API.
   */
  @Get()
  @ApiOperation({ summary: "L'API est-elle vivante ?" })
  @ApiOkResponse({ description: 'Le processus répond.' })
  live(): LivenessResponse {
    return {
      status: 'ok',
      service: 'buslive-api',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * « Readiness » : l'API peut servir des requêtes (base + PostGIS disponibles).
   * Répond 503 si une dépendance est en panne.
   */
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: "L'API est-elle prête (base de données + PostGIS) ?" })
  @ApiServiceUnavailableResponse({ description: 'Une dépendance est indisponible.' })
  ready() {
    return this.health.check([() => this.postgis.isHealthy()]);
  }
}
