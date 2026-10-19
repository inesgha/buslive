import { type DeleteAccountInput, DeleteAccountSchema } from '@buslive/shared';
import { Body, Controller, Delete, HttpCode } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { zodToOpenApi } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AccountService } from './account.service';

@ApiTags('Mon compte')
@ApiBearerAuth()
@Controller('me')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Delete()
  @HttpCode(204)
  // Le mot de passe est redemandé : on limite les essais.
  @RateLimit()
  @ApiOperation({ summary: 'Supprimer mon compte (définitif)' })
  @ApiBody({ schema: zodToOpenApi(DeleteAccountSchema) })
  @ApiNoContentResponse({ description: 'Compte supprimé, signalements anonymisés.' })
  @ApiForbiddenResponse({ description: 'Mot de passe incorrect.' })
  @ApiConflictResponse({ description: 'Compte de modération.' })
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(DeleteAccountSchema)) body: DeleteAccountInput,
  ): Promise<void> {
    return this.account.delete(user.id, body.password);
  }
}
