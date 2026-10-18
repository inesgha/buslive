import {
  type CreateReportInput,
  CreateReportSchema,
  type LineStats,
  LineStatsSchema,
  type Report,
  ReportSchema,
  type TrustSummary,
  TrustSummarySchema,
  type VoteInput,
  VoteInputSchema,
} from '@buslive/shared';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { z } from 'zod';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { zodToOpenApi } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ReportsService } from './reports.service';
import { StatsService } from './stats.service';
import { TrustService } from './trust.service';

const UuidPipe = new ZodValidationPipe(z.uuid('Identifiant invalide.'));

/** Signalements, votes, score de confiance et statistiques des lignes. */
@ApiTags('Signalements')
@Controller()
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly trust: TrustService,
    private readonly stats: StatsService,
  ) {}

  @Post('reports')
  @ApiBearerAuth()
  // En plus de la limite horaire (10 / h, dans le service) : pas de rafale.
  @RateLimit({ max: 5, windowSeconds: 60 })
  @ApiOperation({ summary: 'Signaler un problème (pas venu, plein, retard…)' })
  @ApiBody({ schema: zodToOpenApi(CreateReportSchema) })
  @ApiOkResponse({ schema: zodToOpenApi(ReportSchema, 'output') })
  @ApiTooManyRequestsResponse({ description: 'Trop de signalements.' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateReportSchema)) body: CreateReportInput,
  ): Promise<Report> {
    return this.reports.create(user.id, body);
  }

  @Post('reports/:id/votes')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirmer ou contredire un signalement' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: zodToOpenApi(VoteInputSchema) })
  @ApiOkResponse({ schema: zodToOpenApi(ReportSchema, 'output') })
  @ApiForbiddenResponse({ description: 'Vote sur son propre signalement.' })
  @ApiConflictResponse({ description: 'Déjà voté, ou signalement clos.' })
  vote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(VoteInputSchema)) body: VoteInput,
  ): Promise<Report> {
    return this.reports.vote(user.id, id, body.value);
  }

  @Get('lines/:id/reports')
  @Public()
  @ApiOperation({ summary: 'Signalements en cours d’une ligne' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: zodToOpenApi(z.array(ReportSchema), 'output') })
  lineReports(
    @Param('id', UuidPipe) id: string,
    // Route publique : l'utilisateur est connu s'il envoie un jeton (pour « mon vote »).
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<Report[]> {
    return this.reports.listForLine(id, user?.id);
  }

  @Get('lines/:id/stats')
  @Public()
  @ApiOperation({ summary: 'Statistiques d’une ligne (30 derniers jours)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: zodToOpenApi(LineStatsSchema, 'output') })
  lineStats(@Param('id', UuidPipe) id: string): Promise<LineStats> {
    return this.stats.lineStats(id);
  }

  @Get('me/trust')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mon score de confiance et l’historique de mes points' })
  @ApiOkResponse({ schema: zodToOpenApi(TrustSummarySchema, 'output') })
  myTrust(@CurrentUser() user: AuthenticatedUser): Promise<TrustSummary> {
    return this.trust.summary(user.id);
  }
}
