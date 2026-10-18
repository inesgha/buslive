import { Module } from '@nestjs/common';

import { LiveModule } from '../live/live.module';
import { ObservationsService } from './observations.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { StatsService } from './stats.service';
import { TrustService } from './trust.service';

/**
 * Signalements, confiance, passages observés et statistiques.
 * Dépend du module temps réel (diffusion Socket.io, événements « bus passé à
 * l'arrêt » et « partage terminé »), jamais l'inverse.
 */
@Module({
  imports: [LiveModule],
  controllers: [ReportsController],
  providers: [ReportsService, TrustService, ObservationsService, StatsService],
  exports: [ReportsService],
})
export class ReportsModule {}
