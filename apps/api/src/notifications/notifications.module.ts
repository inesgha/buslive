import { Module } from '@nestjs/common';

import { AlertsModule } from '../alerts/alerts.module';
import { LiveModule } from '../live/live.module';
import { ReportsModule } from '../reports/reports.module';
import { AlertEngine } from './alert-engine.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { pushSenderProvider } from './push/push.provider';

/**
 * Notifications push et historique. Dépend des modules temps réel, signalements
 * et alertes (il écoute leurs événements) ; aucun d'eux ne dépend de lui.
 */
@Module({
  imports: [LiveModule, ReportsModule, AlertsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, AlertEngine, pushSenderProvider],
  // Le covoiturage (phase 9) envoie ses notifications par ce service.
  exports: [NotificationsService],
})
export class NotificationsModule {}
