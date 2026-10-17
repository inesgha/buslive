import { hasMinRole, type Role } from '@buslive/shared';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedRequest } from '../auth.types';
import { MIN_ROLE_KEY } from '../decorators/min-role.decorator';

/**
 * Guard global exécuté après JwtAuthGuard : si la route porte @MinRole(…),
 * vérifie que l'utilisateur a au moins ce rôle (sinon 403).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const minRole = this.reflector.getAllAndOverride<Role | undefined>(MIN_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!minRole) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user || !hasMinRole(user.role, minRole)) {
      throw new ForbiddenException('Droits insuffisants.');
    }
    return true;
  }
}
