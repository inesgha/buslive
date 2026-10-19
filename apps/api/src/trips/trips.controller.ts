import {
  type CreateTripShareInput,
  CreateTripShareSchema,
  type TripShare,
  type TripShareCreated,
  TripShareCreatedSchema,
  TripShareSchema,
  type TripStatus,
  TripStatusSchema,
} from '@buslive/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { zodToOpenApi } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TripsService } from './trips.service';

const UuidPipe = new ZodValidationPipe(z.uuid('Identifiant invalide.'));
/** Jeton d'un lien : base64url, 32 caractères (24 octets aléatoires). */
export const TokenPipe = new ZodValidationPipe(
  z.string().regex(/^[A-Za-z0-9_-]{32}$/, 'Lien invalide.'),
);

/** « Partager mon trajet » : création, liste, révocation, et état public d'un lien. */
@ApiTags('Partager mon trajet')
@Controller()
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Post('trips')
  @ApiBearerAuth()
  @RateLimit({ max: 10, windowSeconds: 60 })
  @ApiOperation({ summary: 'Créer un lien de suivi pour mon partage en cours' })
  @ApiBody({ schema: zodToOpenApi(CreateTripShareSchema) })
  @ApiOkResponse({ schema: zodToOpenApi(TripShareCreatedSchema, 'output') })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateTripShareSchema)) body: CreateTripShareInput,
  ): Promise<TripShareCreated> {
    return this.trips.create(user.id, body);
  }

  @Get('me/trips')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mes liens de suivi encore valables' })
  @ApiOkResponse({ schema: zodToOpenApi(z.array(TripShareSchema), 'output') })
  mine(@CurrentUser() user: AuthenticatedUser): Promise<TripShare[]> {
    return this.trips.listMine(user.id);
  }

  @Delete('trips/:id')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Désactiver un lien de suivi' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string): Promise<void> {
    return this.trips.revoke(user.id, id);
  }

  /** Lu par la page de suivi toutes les 10 s : limité par adresse IP (route publique). */
  @Get('trips/:token')
  @Public()
  @RateLimit({ max: 60, windowSeconds: 60 })
  @ApiOperation({ summary: 'État public d’un trajet partagé (aucune donnée personnelle)' })
  @ApiParam({ name: 'token' })
  @ApiOkResponse({ schema: zodToOpenApi(TripStatusSchema, 'output') })
  @ApiNotFoundResponse({ description: 'Lien inconnu, désactivé ou expiré.' })
  status(@Param('token', TokenPipe) token: string): Promise<TripStatus> {
    return this.trips.status(token);
  }
}
