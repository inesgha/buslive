import { Module } from '@nestjs/common';

import { LiveBroadcaster } from './live.broadcaster';
import { LiveController } from './live.controller';
import { LiveGateway } from './live.gateway';
import { LiveRegistry } from './live.registry';
import { LiveService } from './live.service';
import { RouteCacheService } from './route-cache.service';

/** Temps réel : partage de position (REST) et diffusion des bus en direct (Socket.io). */
@Module({
  controllers: [LiveController],
  providers: [LiveService, LiveRegistry, LiveBroadcaster, LiveGateway, RouteCacheService],
  exports: [LiveService],
})
export class LiveModule {}
