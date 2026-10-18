import {
  type Governorate,
  GovernorateSchema,
  type LineDetail,
  LineDetailSchema,
  type LineSummary,
  LineSummarySchema,
  type LinesQuery,
  LinesQuerySchema,
  type NearbyStop,
  NearbyStopSchema,
  type NearbyStopsQuery,
  NearbyStopsQuerySchema,
  type StopDepartures,
  type StopDeparturesQuery,
  StopDeparturesQuerySchema,
  StopDeparturesSchema,
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

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { zodToOpenApi } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NetworkService } from './network.service';
import { StopsService } from './stops.service';

const UuidPipe = new ZodValidationPipe(z.uuid('Identifiant invalide.'));

/**
 * Lecture du réseau (gouvernorats, lignes, arrêts). Publique : on consulte
 * les lignes et les horaires sans compte.
 */
@ApiTags('Réseau')
@Public()
@Controller()
export class NetworkController {
  constructor(
    private readonly network: NetworkService,
    private readonly stops: StopsService,
  ) {}

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

  // ⚠️ Doit rester AVANT « stops/:id » : sinon « nearby » serait pris pour un identifiant.
  @Get('stops/nearby')
  @ApiOperation({ summary: 'Arrêts proches d’un point, du plus proche au plus loin' })
  @ApiQuery({ name: 'lat', example: 35.4978 })
  @ApiQuery({ name: 'lng', example: 11.0473 })
  @ApiQuery({ name: 'radius', required: false, description: 'Mètres (50 à 3000, défaut 800)' })
  @ApiQuery({ name: 'limit', required: false, description: '1 à 50 (défaut 20)' })
  @ApiOkResponse({ schema: zodToOpenApi(z.array(NearbyStopSchema), 'output') })
  @ApiBadRequestResponse({ description: 'Coordonnées, rayon ou limite invalides.' })
  findNearbyStops(
    @Query(new ZodValidationPipe(NearbyStopsQuerySchema)) query: NearbyStopsQuery,
  ): Promise<NearbyStop[]> {
    return this.stops.findNearby(query);
  }

  @Get('stops/:id/departures')
  @ApiOperation({ summary: 'Prochains passages à un arrêt (24 h à venir, heure de Tunis)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiQuery({ name: 'at', required: false, description: 'Instant de référence ISO 8601 (tests)' })
  @ApiQuery({ name: 'limit', required: false, description: '1 à 200 (défaut 60)' })
  @ApiOkResponse({ schema: zodToOpenApi(StopDeparturesSchema, 'output') })
  @ApiNotFoundResponse({ description: 'Arrêt introuvable ou non publié.' })
  getStopDepartures(
    @Param('id', UuidPipe) id: string,
    @Query(new ZodValidationPipe(StopDeparturesQuerySchema)) query: StopDeparturesQuery,
    // Route publique : l'utilisateur est connu s'il envoie un jeton (pour « mon vote »).
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<StopDepartures> {
    return this.stops.getDepartures(
      id,
      query.at ? new Date(query.at) : new Date(),
      query.limit,
      user?.id,
    );
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
