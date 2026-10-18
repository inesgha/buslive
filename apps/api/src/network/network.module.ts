import { Module } from '@nestjs/common';

import { LiveModule } from '../live/live.module';
import { ReportsModule } from '../reports/reports.module';
import { NetworkController } from './network.controller';
import { NetworkService } from './network.service';
import { StopsService } from './stops.service';

/** Réseau de transport : gouvernorats, lignes, arrêts, horaires (lecture). */
@Module({
  // Arrivées en direct et signalements aux arrêts.
  imports: [LiveModule, ReportsModule],
  controllers: [NetworkController],
  providers: [NetworkService, StopsService],
  exports: [NetworkService],
})
export class NetworkModule {}
