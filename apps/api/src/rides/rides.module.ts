import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';

/** Covoiturage entre utilisateurs (annonces, demandes, acceptation). */
@Module({
  imports: [NotificationsModule],
  controllers: [RidesController],
  providers: [RidesService],
  // La modération annule les annonces signalées.
  exports: [RidesService],
})
export class RidesModule {}
