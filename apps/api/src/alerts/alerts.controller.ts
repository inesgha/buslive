import { type Alert, type AlertInput, AlertInputSchema, AlertSchema } from '@buslive/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
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
import { zodToOpenApi } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AlertsService } from './alerts.service';

const UuidPipe = new ZodValidationPipe(z.uuid('Identifiant invalide.'));

/** Alertes « mon trajet » de l'utilisateur connecté. */
@ApiTags('Alertes')
@ApiBearerAuth()
@Controller('me/alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'Mes alertes' })
  @ApiOkResponse({ schema: zodToOpenApi(z.array(AlertSchema), 'output') })
  list(@CurrentUser() user: AuthenticatedUser): Promise<Alert[]> {
    return this.alerts.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une alerte (ligne, sens, arrêt, plage horaire)' })
  @ApiBody({ schema: zodToOpenApi(AlertInputSchema) })
  @ApiOkResponse({ schema: zodToOpenApi(AlertSchema, 'output') })
  @ApiConflictResponse({ description: 'Limite d’alertes atteinte.' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(AlertInputSchema)) body: AlertInput,
  ): Promise<Alert> {
    return this.alerts.create(user.id, body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Modifier une alerte (y compris l’activer ou la couper)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: zodToOpenApi(AlertInputSchema) })
  @ApiOkResponse({ schema: zodToOpenApi(AlertSchema, 'output') })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(AlertInputSchema)) body: AlertInput,
  ): Promise<Alert> {
    return this.alerts.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer une alerte' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string): Promise<void> {
    return this.alerts.remove(user.id, id);
  }
}
