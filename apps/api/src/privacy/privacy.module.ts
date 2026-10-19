import { Module } from '@nestjs/common';

import { LegalController } from './legal.controller';
import { RetentionService } from './retention.service';

/** Vie privée : durées de conservation appliquées chaque jour, pages légales. */
@Module({
  controllers: [LegalController],
  providers: [RetentionService],
})
export class PrivacyModule {}
