import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { LiveModule } from '../live/live.module';
import { RidesModule } from '../rides/rides.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

/** Suppression de compte (anonymisation des contributions). */
@Module({
  imports: [AuthModule, LiveModule, RidesModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
