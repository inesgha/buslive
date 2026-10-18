import { Module } from '@nestjs/common';

import { NetworkController } from './network.controller';
import { NetworkService } from './network.service';

/** Réseau de transport : gouvernorats, lignes, arrêts, horaires (lecture). */
@Module({
  controllers: [NetworkController],
  providers: [NetworkService],
  exports: [NetworkService],
})
export class NetworkModule {}
