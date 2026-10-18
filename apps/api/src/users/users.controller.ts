import {
  type UpdateProfileInput,
  UpdateProfileSchema,
  type UserProfile,
  UserProfileSchema,
} from '@buslive/shared';
import { Body, Controller, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { zodToOpenApi } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UsersService } from './users.service';

/** Préférences du compte connecté (le profil se lit avec GET /auth/me). */
@ApiTags('Mon compte')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch()
  @ApiOperation({ summary: 'Modifier ma langue ou mes préférences de notification' })
  @ApiBody({ schema: zodToOpenApi(UpdateProfileSchema) })
  @ApiOkResponse({ schema: zodToOpenApi(UserProfileSchema, 'output') })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) body: UpdateProfileInput,
  ): Promise<UserProfile> {
    return this.users.update(user.id, body);
  }
}
