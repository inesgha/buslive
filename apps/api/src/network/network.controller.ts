import {
  type Governorate,
  GovernorateSchema,
  type LineDetail,
  LineDetailSchema,
  type LineSummary,
  LineSummarySchema,
  type LinesQuery,
  LinesQuerySchema,
  type StopDetail,
  StopDetailSchema,
} from '@buslive/shared';
import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';

import { Public } from '../auth/decorators/public.decorator';
import { zodToOpenApi } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NetworkService } from './network.service';

const UuidPipe = new ZodValidationPipe(z.uuid('Identifiant invalide.'));

/**
 * Lecture du réseau (gouvernorats, lignes, arrêts). Publique : on consulte
 * les lignes et les horaires sans compte.
 */
@ApiTags('Réseau')
@Public()
@Controller()
export class NetworkController {
  constructor(private readonly network: NetworkService) {}

  @Get('governorates')
  @ApiOperation({ summary: 'Gouvernorats ouverts dans l’app' })
  @ApiOkResponse({ schema: zodToOpenApi(z.array(GovernorateSchema), 'output') })
  listGovernorates(): Promise<Governorate[]> {
    return this.network.listGovernorates();
  }

  @Get('lines')
  @ApiOperation({ summary: 'Lignes actives (option : filtrer par gouvernorat)' })
  @ApiQuery({ name: 'governorate', required: false, example: 'TN-53' })
  @ApiOkResponse({ schema: zodToOpenApi(z.array(LineSummarySchema), 'output') })
  @ApiBadRequestResponse({ description: 'Code de gouvernorat invalide.' })
  listLines(
    @Query(new ZodValidationPipe(LinesQuerySchema)) query: LinesQuery,
  ): Promise<LineSummary[]> {
    return this.network.listLines(query.governorate);
  }

  @Get('lines/:id')
  @ApiOperation({ summary: 'Détail d’une ligne : sens, arrêts, tracé, départs et calendriers' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: zodToOpenApi(LineDetailSchema, 'output') })
  @ApiNotFoundResponse({ description: 'Ligne introuvable ou non publiée.' })
  getLine(@Param('id', UuidPipe) id: string): Promise<LineDetail> {
    return this.network.getLine(id);
  }

  @Get('stops/:id')
  @ApiOperation({ summary: 'Détail d’un arrêt et lignes qui le desservent' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: zodToOpenApi(StopDetailSchema, 'output') })
  @ApiNotFoundResponse({ description: 'Arrêt introuvable ou non publié.' })
  getStop(@Param('id', UuidPipe) id: string): Promise<StopDetail> {
    return this.network.getStop(id);
  }
}
