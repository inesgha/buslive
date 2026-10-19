import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsModule } from '../reports/reports.module';
import { RidesModule } from '../rides/rides.module';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminModerationService } from './admin-moderation.service';
import { AdminNetworkService } from './admin-network.service';
import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';
import { ModerationLogService } from './moderation-log.service';

/**
 * Tableau de bord et modération (apps/admin). Dépend des modules métier
 * (signalements, covoiturage, notifications, sessions) ; aucun ne dépend de lui.
 */
@Module({
  imports: [AuthModule, ReportsModule, RidesModule, NotificationsModule],
  controllers: [AdminController],
  providers: [
    AdminDashboardService,
    AdminModerationService,
    AdminUsersService,
    AdminNetworkService,
    ModerationLogService,
  ],
})
export class AdminModule {}
