import {
  type AuthResponse,
  LoginSchema,
  type LoginInput,
  RefreshTokenInputSchema,
  type RefreshTokenInput,
  RegisterSchema,
  type RegisterInput,
  type UserProfile,
} from '@buslive/shared';
import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { zodToOpenApi } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { AuthenticatedUser } from './auth.types';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Public()
  // Limitation des tentatives par adresse IP (RATE_LIMIT_* dans .env).
  @RateLimit()
  @ApiOperation({ summary: 'Créer un compte' })
  @ApiBody({ schema: zodToOpenApi(RegisterSchema) })
  @ApiConflictResponse({ description: 'Un compte existe déjà avec cet email.' })
  @ApiTooManyRequestsResponse({ description: 'Trop de tentatives.' })
  register(
    @Body(new ZodValidationPipe(RegisterSchema)) body: RegisterInput,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponse> {
    return this.auth.register(body, userAgent);
  }

  @Post('login')
  @HttpCode(200)
  @Public()
  @RateLimit()
  @ApiOperation({ summary: 'Se connecter' })
  @ApiBody({ schema: zodToOpenApi(LoginSchema) })
  @ApiUnauthorizedResponse({ description: 'Email ou mot de passe incorrect.' })
  @ApiTooManyRequestsResponse({ description: 'Trop de tentatives.' })
  login(
    @Body(new ZodValidationPipe(LoginSchema)) body: LoginInput,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponse> {
    return this.auth.login(body, userAgent);
  }

  @Post('refresh')
  @HttpCode(200)
  @Public()
  @ApiOperation({ summary: 'Obtenir de nouveaux jetons (rotation du refresh token)' })
  @ApiBody({ schema: zodToOpenApi(RefreshTokenInputSchema) })
  @ApiUnauthorizedResponse({ description: 'Refresh token invalide, expiré ou déjà utilisé.' })
  refresh(
    @Body(new ZodValidationPipe(RefreshTokenInputSchema)) body: RefreshTokenInput,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponse> {
    return this.auth.refresh(body.refreshToken, userAgent);
  }

  /**
   * Publique : on doit pouvoir se déconnecter même avec un access token expiré.
   * Répond toujours 204, que le jeton soit connu ou non.
   */
  @Post('logout')
  @HttpCode(204)
  @Public()
  @ApiOperation({ summary: 'Se déconnecter (révoque la session)' })
  @ApiBody({ schema: zodToOpenApi(RefreshTokenInputSchema) })
  logout(
    @Body(new ZodValidationPipe(RefreshTokenInputSchema)) body: RefreshTokenInput,
  ): Promise<void> {
    return this.auth.logout(body.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profil de l’utilisateur connecté' })
  @ApiUnauthorizedResponse({ description: 'Access token absent, invalide ou expiré.' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserProfile> {
    return this.auth.me(user.id);
  }
}
