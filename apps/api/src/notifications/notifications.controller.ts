import {
  type MarkNotificationsReadInput,
  MarkNotificationsReadSchema,
  type NotificationList,
  NotificationListSchema,
  type RegisterPushDeviceInput,
  RegisterPushDeviceSchema,
  type TestNotificationResult,
  TestNotificationResultSchema,
  type UnregisterPushDeviceInput,
  UnregisterPushDeviceSchema,
} from '@buslive/shared';
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { zodToOpenApi } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

/** Téléphones qui reçoivent les push, et historique des notifications. */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('me')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('push-devices')
  @HttpCode(204)
  @ApiOperation({ summary: 'Enregistrer ce téléphone pour les notifications push (jeton FCM)' })
  @ApiBody({ schema: zodToOpenApi(RegisterPushDeviceSchema) })
  @ApiNoContentResponse()
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(RegisterPushDeviceSchema)) body: RegisterPushDeviceInput,
  ): Promise<void> {
    return this.notifications.registerDevice(user.id, body);
  }

  @Post('push-devices/unregister')
  @HttpCode(204)
  @ApiOperation({ summary: 'Ne plus recevoir les notifications sur ce téléphone (déconnexion)' })
  @ApiBody({ schema: zodToOpenApi(UnregisterPushDeviceSchema) })
  @ApiNoContentResponse()
  unregisterDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UnregisterPushDeviceSchema)) body: UnregisterPushDeviceInput,
  ): Promise<void> {
    return this.notifications.unregisterDevice(user.id, body.token);
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Mes dernières notifications (30 jours)' })
  @ApiOkResponse({ schema: zodToOpenApi(NotificationListSchema, 'output') })
  list(@CurrentUser() user: AuthenticatedUser): Promise<NotificationList> {
    return this.notifications.list(user.id);
  }

  @Post('notifications/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marquer des notifications comme lues (toutes, sans « ids »)' })
  @ApiBody({ schema: zodToOpenApi(MarkNotificationsReadSchema) })
  @ApiNoContentResponse()
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(MarkNotificationsReadSchema)) body: MarkNotificationsReadInput,
  ): Promise<void> {
    return this.notifications.markRead(user.id, body);
  }

  @Post('notifications/test')
  @HttpCode(200)
  @RateLimit({ max: 3, windowSeconds: 60 })
  @ApiOperation({ summary: 'M’envoyer une notification d’essai' })
  @ApiOkResponse({ schema: zodToOpenApi(TestNotificationResultSchema, 'output') })
  @ApiTooManyRequestsResponse({ description: 'Trop d’essais.' })
  test(@CurrentUser() user: AuthenticatedUser): Promise<TestNotificationResult> {
    return this.notifications.sendTest(user.id);
  }
}
