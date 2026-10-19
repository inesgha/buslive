import {
  type StopProposal,
  type StopProposalInput,
  StopProposalInputSchema,
  StopProposalSchema,
} from '@buslive/shared';
import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { zodToOpenApi } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProposalsService } from './proposals.service';

/** Arrêts proposés par les passagers (examinés par les modérateurs). */
@ApiTags('Réseau')
@ApiBearerAuth()
@Controller()
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Post('stops/proposals')
  @RateLimit({ max: 5, windowSeconds: 60 })
  @ApiOperation({ summary: 'Proposer un arrêt (invisible tant qu’il n’est pas approuvé)' })
  @ApiBody({ schema: zodToOpenApi(StopProposalInputSchema) })
  @ApiOkResponse({ schema: zodToOpenApi(StopProposalSchema, 'output') })
  @ApiConflictResponse({ description: 'Un arrêt existe déjà à moins de 30 m.' })
  propose(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(StopProposalInputSchema)) body: StopProposalInput,
  ): Promise<StopProposal> {
    return this.proposals.propose(user.id, body);
  }

  @Get('me/stop-proposals')
  @ApiOperation({ summary: 'Mes arrêts proposés et leur statut' })
  @ApiOkResponse({ schema: zodToOpenApi(z.array(StopProposalSchema), 'output') })
  mine(@CurrentUser() user: AuthenticatedUser): Promise<StopProposal[]> {
    return this.proposals.mine(user.id);
  }
}
