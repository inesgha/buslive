import { Module } from '@nestjs/common';

import { LiveModule } from '../live/live.module';
import { TripPageController } from './trip-page.controller';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

/** « Partager mon trajet » : liens de suivi et page web publique. */
@Module({
  imports: [LiveModule],
  controllers: [TripsController, TripPageController],
  providers: [TripsService],
})
export class TripsModule {}
