import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { PostgisHealthIndicator } from './postgis.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [PostgisHealthIndicator],
})
export class HealthModule {}
