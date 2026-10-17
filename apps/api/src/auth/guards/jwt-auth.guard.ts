import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import type { AccessTokenPayload, AuthenticatedRequest } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard global : exige un access token valide sur toutes les routes, sauf
 * celles marquées @Public(). L'utilisateur décodé est placé dans request.user.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Authentification requise.');
    }

    try {
      // Vérifie la signature, l'expiration, l'émetteur et le destinataire
      // (options définies dans AuthModule).
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      request.user = { id: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expiré.');
    }
  }
}

/** « Bearer abc.def.ghi » → « abc.def.ghi » ; undefined si l'en-tête est absent ou mal formé. */
export function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}
