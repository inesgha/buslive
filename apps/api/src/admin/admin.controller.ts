import {
  type AdminDashboard,
  AdminDashboardSchema,
  type AdminGovernorate,
  AdminGovernorateSchema,
  type AdminLouageStation,
  AdminLouageStationSchema,
  type AdminReport,
  AdminReportSchema,
  type AdminReportsQuery,
  AdminReportsQuerySchema,
  type AdminRideFlag,
  AdminRideFlagSchema,
  type AdminStop,
  type AdminStopProposal,
  AdminStopProposalSchema,
  AdminStopSchema,
  type AdminStopsQuery,
  AdminStopsQuerySchema,
  type AdminUser,
  AdminUserSchema,
  type AdminUsersQuery,
  AdminUsersQuerySchema,
  type ChangeRoleInput,
  ChangeRoleSchema,
  GovernorateCodeSchema,
  type ModerateReportInput,
  ModerateReportSchema,
  type ModerationAction,
  ModerationActionSchema,
  type ModerationLogQuery,
  ModerationLogQuerySchema,
  type ResolveRideFlagsInput,
  ResolveRideFlagsSchema,
  type ReviewStopProposalInput,
  ReviewStopProposalSchema,
  type StopMove,
  type StopMoveDecisionInput,
  StopMoveDecisionSchema,
  StopMoveSchema,
  type SuspendUserInput,
  SuspendUserSchema,
  type UpdateGovernorateInput,
  UpdateGovernorateSchema,
  type UpdateStopInput,
  UpdateStopSchema,
  type UpsertLouageStationInput,
  UpsertLouageStationSchema,
} from '@buslive/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MinRole } from '../auth/decorators/min-role.decorator';
import { zodToOpenApi } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminModerationService } from './admin-moderation.service';
import { AdminNetworkService } from './admin-network.service';
import { AdminUsersService } from './admin-users.service';
import { ModerationLogService } from './moderation-log.service';

const UuidPipe = new ZodValidationPipe(z.uuid('Identifiant invalide.'));
const out = (schema: z.ZodType) => ({ schema: zodToOpenApi(schema, 'output') });

/**
 * Tableau de bord et modération : MODERATOR au minimum sur toutes les routes
 * de cette classe ; les routes marquées @MinRole('ADMIN') exigent davantage.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Droits insuffisants.' })
@MinRole('MODERATOR')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly moderation: AdminModerationService,
    private readonly users: AdminUsersService,
    private readonly network: AdminNetworkService,
    private readonly log: ModerationLogService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Chiffres clés et files de modération' })
  @ApiOkResponse(out(AdminDashboardSchema))
  getDashboard(): Promise<AdminDashboard> {
    return this.dashboard.dashboard();
  }

  @Get('moderation-log')
  @ApiOperation({ summary: 'Journal de modération (le plus récent d’abord)' })
  @ApiOkResponse(out(z.array(ModerationActionSchema)))
  moderationLog(
    @Query(new ZodValidationPipe(ModerationLogQuerySchema)) query: ModerationLogQuery,
  ): Promise<ModerationAction[]> {
    return this.log.list(query);
  }

  // --- Signalements -------------------------------------------------------------------

  @Get('reports')
  @ApiOperation({ summary: 'Signalements (filtres ; « contested » = à examiner)' })
  @ApiOkResponse(out(z.array(AdminReportSchema)))
  reports(
    @Query(new ZodValidationPipe(AdminReportsQuerySchema)) query: AdminReportsQuery,
  ): Promise<AdminReport[]> {
    return this.moderation.listReports(query);
  }

  @Post('reports/:id/decision')
  @HttpCode(204)
  @ApiOperation({ summary: 'Confirmer, démentir ou masquer un signalement' })
  @ApiBody({ schema: zodToOpenApi(ModerateReportSchema) })
  moderateReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(ModerateReportSchema)) body: ModerateReportInput,
  ): Promise<void> {
    return this.moderation.moderateReport(user.id, id, body);
  }

  // --- Arrêts -----------------------------------------------------------------------------

  @Get('stop-moves')
  @ApiOperation({ summary: '« Arrêts déplacés » confirmés, à examiner' })
  @ApiOkResponse(out(z.array(StopMoveSchema)))
  stopMoves(): Promise<StopMove[]> {
    return this.moderation.listStopMoves();
  }

  @Post('stop-moves/:reportId/decision')
  @HttpCode(204)
  @ApiOperation({ summary: 'Appliquer la nouvelle position, ou classer sans suite' })
  @ApiBody({ schema: zodToOpenApi(StopMoveDecisionSchema) })
  decideStopMove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId', UuidPipe) reportId: string,
    @Body(new ZodValidationPipe(StopMoveDecisionSchema)) body: StopMoveDecisionInput,
  ): Promise<void> {
    return this.moderation.decideStopMove(user.id, reportId, body.apply);
  }

  @Get('stop-proposals')
  @ApiOperation({ summary: 'Arrêts proposés par les passagers' })
  @ApiOkResponse(out(z.array(AdminStopProposalSchema)))
  stopProposals(): Promise<AdminStopProposal[]> {
    return this.moderation.listStopProposals();
  }

  @Post('stop-proposals/:id/decision')
  @HttpCode(204)
  @ApiOperation({ summary: 'Approuver (avec corrections) ou refuser une proposition' })
  @ApiBody({ schema: zodToOpenApi(ReviewStopProposalSchema) })
  reviewStopProposal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(ReviewStopProposalSchema)) body: ReviewStopProposalInput,
  ): Promise<void> {
    return this.moderation.reviewStopProposal(user.id, id, body);
  }

  // --- Covoiturage ------------------------------------------------------------------------

  @Get('ride-flags')
  @ApiOperation({ summary: 'Trajets de covoiturage signalés' })
  @ApiOkResponse(out(z.array(AdminRideFlagSchema)))
  rideFlags(): Promise<AdminRideFlag[]> {
    return this.moderation.listRideFlags();
  }

  @Post('ride-flags/:offerId/decision')
  @HttpCode(204)
  @ApiOperation({ summary: 'Annuler le trajet (passagers prévenus) ou classer' })
  @ApiBody({ schema: zodToOpenApi(ResolveRideFlagsSchema) })
  resolveRideFlags(
    @CurrentUser() user: AuthenticatedUser,
    @Param('offerId', UuidPipe) offerId: string,
    @Body(new ZodValidationPipe(ResolveRideFlagsSchema)) body: ResolveRideFlagsInput,
  ): Promise<void> {
    return this.moderation.resolveRideFlags(user.id, offerId, body);
  }

  // --- Comptes ------------------------------------------------------------------------------

  @Get('users')
  @ApiOperation({ summary: 'Rechercher des comptes' })
  @ApiOkResponse(out(z.array(AdminUserSchema)))
  listUsers(
    @Query(new ZodValidationPipe(AdminUsersQuerySchema)) query: AdminUsersQuery,
  ): Promise<AdminUser[]> {
    return this.users.list(query);
  }

  @Post('users/:id/suspension')
  @HttpCode(200)
  @ApiOperation({ summary: 'Suspendre ou réactiver (comptes de rôle inférieur seulement)' })
  @ApiBody({ schema: zodToOpenApi(SuspendUserSchema) })
  @ApiOkResponse(out(AdminUserSchema))
  suspend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(SuspendUserSchema)) body: SuspendUserInput,
  ): Promise<AdminUser> {
    return this.users.setSuspended(user, id, body.suspended);
  }

  @Put('users/:id/role')
  @MinRole('ADMIN')
  @ApiOperation({ summary: 'Changer le rôle d’un compte (administrateurs)' })
  @ApiBody({ schema: zodToOpenApi(ChangeRoleSchema) })
  @ApiOkResponse(out(AdminUserSchema))
  changeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(ChangeRoleSchema)) body: ChangeRoleInput,
  ): Promise<AdminUser> {
    return this.users.changeRole(user, id, body.role);
  }

  // --- Réseau (administrateurs) ------------------------------------------------------------

  @Get('governorates')
  @MinRole('ADMIN')
  @ApiOperation({ summary: 'Gouvernorats (ouverts ou non)' })
  @ApiOkResponse(out(z.array(AdminGovernorateSchema)))
  governorates(): Promise<AdminGovernorate[]> {
    return this.network.listGovernorates();
  }

  @Patch('governorates/:code')
  @HttpCode(204)
  @MinRole('ADMIN')
  @ApiOperation({ summary: 'Ouvrir ou fermer un gouvernorat' })
  @ApiBody({ schema: zodToOpenApi(UpdateGovernorateSchema) })
  setGovernorate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code', new ZodValidationPipe(GovernorateCodeSchema)) code: string,
    @Body(new ZodValidationPipe(UpdateGovernorateSchema)) body: UpdateGovernorateInput,
  ): Promise<void> {
    return this.network.setGovernorateActive(user.id, code, body.isActive);
  }

  @Get('stops')
  @MinRole('ADMIN')
  @ApiOperation({ summary: 'Arrêts (recherche)' })
  @ApiOkResponse(out(z.array(AdminStopSchema)))
  stops(
    @Query(new ZodValidationPipe(AdminStopsQuerySchema)) query: AdminStopsQuery,
  ): Promise<AdminStop[]> {
    return this.network.listStops(query);
  }

  @Patch('stops/:id')
  @HttpCode(204)
  @MinRole('ADMIN')
  @ApiOperation({ summary: 'Corriger un arrêt (noms, position, statut)' })
  @ApiBody({ schema: zodToOpenApi(UpdateStopSchema) })
  updateStop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(UpdateStopSchema)) body: UpdateStopInput,
  ): Promise<void> {
    return this.network.updateStop(user.id, id, body);
  }

  @Get('louage-stations')
  @MinRole('ADMIN')
  @ApiOperation({ summary: 'Stations de louage (toutes)' })
  @ApiOkResponse(out(z.array(AdminLouageStationSchema)))
  louageStations(): Promise<AdminLouageStation[]> {
    return this.network.listLouageStations();
  }

  @Post('louage-stations')
  @MinRole('ADMIN')
  @ApiOperation({ summary: 'Créer une station de louage' })
  @ApiBody({ schema: zodToOpenApi(UpsertLouageStationSchema) })
  @ApiOkResponse(out(AdminLouageStationSchema))
  createLouageStation(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpsertLouageStationSchema)) body: UpsertLouageStationInput,
  ): Promise<AdminLouageStation> {
    return this.network.saveLouageStation(user.id, body);
  }

  @Put('louage-stations/:id')
  @MinRole('ADMIN')
  @ApiOperation({ summary: 'Remplacer une station de louage (destinations comprises)' })
  @ApiBody({ schema: zodToOpenApi(UpsertLouageStationSchema) })
  @ApiOkResponse(out(AdminLouageStationSchema))
  updateLouageStation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(UpsertLouageStationSchema)) body: UpsertLouageStationInput,
  ): Promise<AdminLouageStation> {
    return this.network.saveLouageStation(user.id, body, id);
  }

  @Delete('louage-stations/:id')
  @HttpCode(204)
  @MinRole('ADMIN')
  @ApiOperation({ summary: 'Archiver une station de louage' })
  archiveLouageStation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
  ): Promise<void> {
    return this.network.archiveLouageStation(user.id, id);
  }
}
