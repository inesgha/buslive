import {
  type NearbyLouageQuery,
  NearbyLouageQuerySchema,
  type NearbyLouageStation,
  NearbyLouageStationSchema,
} from '@buslive/shared';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { Public } from '../auth/decorators/public.decorator';
import { zodToOpenApi } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LouageService } from './louage.service';

/** Louages : lecture publique, comme les horaires de bus. */
@ApiTags('Alternatives')
@Public()
@Controller('louage')
export class LouageController {
  constructor(private readonly louage: LouageService) {}

  @Get('stations/nearby')
  @ApiOperation({ summary: 'Stations de louage proches, avec leurs destinations et prix' })
  @ApiOkResponse({ schema: zodToOpenApi(z.array(NearbyLouageStationSchema), 'output') })
  @ApiBadRequestResponse({ description: 'Position ou paramètres invalides.' })
  nearby(
    @Query(new ZodValidationPipe(NearbyLouageQuerySchema)) query: NearbyLouageQuery,
  ): Promise<NearbyLouageStation[]> {
    return this.louage.findNearby(query);
  }
}
