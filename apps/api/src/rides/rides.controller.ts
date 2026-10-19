import {
  type CreateRideOfferInput,
  CreateRideOfferSchema,
  type MyRides,
  MyRidesSchema,
  type RideFlagInput,
  RideFlagInputSchema,
  type RideOffer,
  type RideOfferDetail,
  RideOfferDetailSchema,
  RideOfferSchema,
  type RideRequestInput,
  RideRequestInputSchema,
  type RideSearchQuery,
  RideSearchQuerySchema,
} from '@buslive/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { zodToOpenApi } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RidesService } from './rides.service';

const UuidPipe = new ZodValidationPipe(z.uuid('Identifiant invalide.'));
const detail = { schema: zodToOpenApi(RideOfferDetailSchema, 'output') };

/**
 * Covoiturage. Réservé aux utilisateurs connectés : les annonces montrent le
 * prénom du conducteur, et on limite ainsi la récolte automatique.
 */
@ApiTags('Alternatives')
@ApiBearerAuth()
@Controller()
export class RidesController {
  constructor(private readonly rides: RidesService) {}

  @Get('rides')
  @ApiOperation({ summary: 'Trajets de covoiturage des 7 prochains jours' })
  @ApiOkResponse({ schema: zodToOpenApi(z.array(RideOfferSchema), 'output') })
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(RideSearchQuerySchema)) query: RideSearchQuery,
  ): Promise<RideOffer[]> {
    return this.rides.search(user.id, query);
  }

  @Get('me/rides')
  @ApiOperation({ summary: 'Mes trajets proposés et mes demandes de places' })
  @ApiOkResponse({ schema: zodToOpenApi(MyRidesSchema, 'output') })
  mine(@CurrentUser() user: AuthenticatedUser): Promise<MyRides> {
    return this.rides.mine(user.id);
  }

  @Get('rides/:id')
  @ApiOperation({ summary: 'Détail d’un trajet (les demandes ne sont visibles que du conducteur)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse(detail)
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
  ): Promise<RideOfferDetail> {
    return this.rides.detail(user.id, id);
  }

  @Post('rides')
  @RateLimit({ max: 5, windowSeconds: 60 })
  @ApiOperation({ summary: 'Proposer un trajet (téléphone requis dans le profil)' })
  @ApiBody({ schema: zodToOpenApi(CreateRideOfferSchema) })
  @ApiOkResponse(detail)
  @ApiBadRequestResponse({ description: 'Heure de départ invalide, ou téléphone manquant.' })
  @ApiConflictResponse({ description: 'Trop de trajets en cours.' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateRideOfferSchema)) body: CreateRideOfferInput,
  ): Promise<RideOfferDetail> {
    return this.rides.create(user.id, body);
  }

  @Post('rides/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Annuler mon trajet (les passagers sont prévenus)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse(detail)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
  ): Promise<RideOfferDetail> {
    return this.rides.cancel(user.id, id);
  }

  @Post('rides/:id/requests')
  @RateLimit({ max: 10, windowSeconds: 60 })
  @ApiOperation({ summary: 'Demander des places' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: zodToOpenApi(RideRequestInputSchema) })
  @ApiOkResponse(detail)
  @ApiConflictResponse({ description: 'Trajet fermé, plus assez de places, ou déjà demandé.' })
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(RideRequestInputSchema)) body: RideRequestInput,
  ): Promise<RideOfferDetail> {
    return this.rides.requestSeats(user.id, id, body.seats);
  }

  @Delete('rides/:id/requests/mine')
  @ApiOperation({ summary: 'Annuler ma demande' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse(detail)
  cancelRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
  ): Promise<RideOfferDetail> {
    return this.rides.cancelRequest(user.id, id);
  }

  @Post('rides/:id/requests/:requestId/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accepter une demande (les numéros sont alors échangés)' })
  @ApiOkResponse(detail)
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Param('requestId', UuidPipe) requestId: string,
  ): Promise<RideOfferDetail> {
    return this.rides.respond(user.id, id, requestId, true);
  }

  @Post('rides/:id/requests/:requestId/decline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refuser une demande' })
  @ApiOkResponse(detail)
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Param('requestId', UuidPipe) requestId: string,
  ): Promise<RideOfferDetail> {
    return this.rides.respond(user.id, id, requestId, false);
  }

  @Post('rides/:id/flags')
  @HttpCode(204)
  @ApiOperation({ summary: 'Signaler un trajet (faux, dangereux, inapproprié)' })
  @ApiBody({ schema: zodToOpenApi(RideFlagInputSchema) })
  @ApiNoContentResponse()
  flag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(RideFlagInputSchema)) body: RideFlagInput,
  ): Promise<void> {
    return this.rides.flag(user.id, id, body.reason);
  }
}
