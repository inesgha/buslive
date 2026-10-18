import { Module } from '@nestjs/common';

import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

/** Alertes « mon trajet » (CRUD). Le moteur qui les déclenche est dans NotificationsModule. */
@Module({
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
