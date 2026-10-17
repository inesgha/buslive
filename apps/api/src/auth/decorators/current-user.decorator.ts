import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest, AuthenticatedUser } from '../auth.types';

/**
 * Injecte l'utilisateur connecté dans un paramètre de route :
 *   me(@CurrentUser() user: AuthenticatedUser)
 * À n'utiliser que sur des routes protégées (non @Public).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
