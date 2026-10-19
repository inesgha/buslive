import { Module } from '@nestjs/common';

import { LouageController } from './louage.controller';
import { LouageService } from './louage.service';

/** Stations de louage et destinations (alternatives au bus). */
@Module({
  controllers: [LouageController],
  providers: [LouageService],
})
export class LouageModule {}
