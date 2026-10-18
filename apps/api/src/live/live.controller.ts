import {
  type LineVehicles,
  LineVehiclesSchema,
  type LiveSession,
  LiveSessionSchema,
  type PositionBatch,
  type PositionBatchResult,
  PositionBatchResultSchema,
  PositionBatchSchema,
  type StartLiveSessionInput,
  StartLiveSessionSchema,
} from '@buslive/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
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
import { LiveService } from './live.service';

const UuidPipe = new ZodValidationPipe(z.uuid('Identifiant invalide.'));

/** « Je suis dans le bus » : partage de position et bus en direct. */
@ApiTags('Temps réel')
@Controller('live')
export class LiveController {
  constructor(private readonly live: LiveService) {}

  @Post('sessions')
  @ApiBearerAuth()
  @RateLimit({ max: 10, windowSeconds: 60 })
  @ApiOperation({ summary: 'Commencer à partager sa position dans un bus' })
  @ApiBody({ schema: zodToOpenApi(StartLiveSessionSchema) })
  @ApiOkResponse({ schema: zodToOpenApi(LiveSessionSchema, 'output') })
  @ApiNotFoundResponse({ description: 'Ligne ou sens introuvable.' })
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(StartLiveSessionSchema)) body: StartLiveSessionInput,
  ): Promise<LiveSession> {
    return this.live.start(user.id, body);
  }

  @Post('sessions/:id/positions')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Envoyer un lot de positions (20 au plus)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: zodToOpenApi(PositionBatchSchema) })
  @ApiOkResponse({ schema: zodToOpenApi(PositionBatchResultSchema, 'output') })
  addPositions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(PositionBatchSchema)) body: PositionBatch,
  ): Promise<PositionBatchResult> {
    return this.live.addPositions(user.id, id, body);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Arrêter le partage' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: zodToOpenApi(LiveSessionSchema, 'output') })
  end(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
  ): Promise<LiveSession> {
    return this.live.end(user.id, id);
  }

  @Get('lines/:id/vehicles')
  @Public()
  @ApiOperation({ summary: 'Bus en direct d’une ligne (état actuel)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: zodToOpenApi(LineVehiclesSchema, 'output') })
  lineVehicles(@Param('id', UuidPipe) id: string): LineVehicles {
    return this.live.lineVehicles(id);
  }
}
