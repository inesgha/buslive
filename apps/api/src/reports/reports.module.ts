import { Module } from '@nestjs/common';

import { LiveModule } from '../live/live.module';
import { ObservationsService } from './observations.service';
import { ReportsController } from './reports.controller';
import { ReportEvents } from './reports.events';
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
  providers: [ReportsService, TrustService, ObservationsService, StatsService, ReportEvents],
  // ReportEvents : le module des notifications s'abonne aux décisions.
  exports: [ReportsService, ReportEvents],
})
export class ReportsModule {}
