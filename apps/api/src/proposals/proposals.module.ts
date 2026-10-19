import { Module } from '@nestjs/common';

import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';

/** Propositions d'arrêts par les passagers. */
@Module({
  controllers: [ProposalsController],
  providers: [ProposalsService],
})
export class ProposalsModule {}
