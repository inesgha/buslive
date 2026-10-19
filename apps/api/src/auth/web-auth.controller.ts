import { type LoginInput, LoginSchema, type WebAuthResponse } from '@buslive/shared';
import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { zodToOpenApi } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Env } from '../config/env.schema';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

/** Nom du cookie du refresh token web. */
export const WEB_REFRESH_COOKIE = 'buslive_rt';
/** Le cookie n'est envoyé QUE vers ces routes : jamais avec les autres requêtes. */
const COOKIE_PATH = '/api/v1/auth/web';

/** Lit un cookie dans l'en-tête Cookie (pas besoin d'une dépendance pour si peu). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

/**
 * Session du tableau de bord web (apps/admin). Différence avec l'app mobile :
 * le refresh token est posé dans un cookie httpOnly (SameSite=Strict, limité à
 * /api/v1/auth/web) au lieu d'être renvoyé dans le corps. Le JavaScript de la
 * page ne peut donc pas le lire : une faille XSS ne peut pas voler la session.
 * Contre les requêtes envoyées depuis un autre site (CSRF), l'origine doit en
 * plus figurer dans CORS_ORIGINS.
 */
@ApiTags('Authentification')
@Public()
@Controller('auth/web')
export class WebAuthController {
  private readonly origins: string[];
  private readonly refreshTtlMs: number;
  private readonly secure: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.origins = config.get('CORS_ORIGINS', { infer: true });
    this.refreshTtlMs = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 86_400_000;
    // En production, le cookie ne circule qu'en HTTPS.
    this.secure = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  @Post('login')
  @HttpCode(200)
  @RateLimit()
  @ApiOperation({ summary: 'Connexion au tableau de bord (modérateurs et administrateurs)' })
  @ApiBody({ schema: zodToOpenApi(LoginSchema) })
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) body: LoginInput,
    @Headers('origin') origin: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<WebAuthResponse> {
    this.checkOrigin(origin);
    const auth = await this.auth.loginStaff(body, userAgent);
    this.setCookie(response, auth.tokens.refreshToken);
    return toWebResponse(auth);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Nouvel access token (refresh token lu dans le cookie)' })
  async refresh(
    @Req() request: Request,
    @Headers('origin') origin: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<WebAuthResponse> {
    this.checkOrigin(origin);
    const token = readCookie(request.headers.cookie, WEB_REFRESH_COOKIE);
    if (!token) throw new UnauthorizedException('Session expirée. Reconnecte-toi.');
    try {
      const auth = await this.auth.refreshStaff(token, userAgent);
      this.setCookie(response, auth.tokens.refreshToken);
      return toWebResponse(auth);
    } catch (error) {
      this.clearCookie(response);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @ApiExcludeEndpoint()
  async logout(
    @Req() request: Request,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.checkOrigin(origin);
    const token = readCookie(request.headers.cookie, WEB_REFRESH_COOKIE);
    if (token) await this.auth.logout(token);
    this.clearCookie(response);
  }

  private checkOrigin(origin: string | undefined): void {
    if (!origin || !this.origins.includes(origin)) {
      throw new ForbiddenException('Origine non autorisée.');
    }
  }

  private setCookie(response: Response, token: string): void {
    response.cookie(WEB_REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.secure,
      path: COOKIE_PATH,
      maxAge: this.refreshTtlMs,
    });
  }

  private clearCookie(response: Response): void {
    response.clearCookie(WEB_REFRESH_COOKIE, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.secure,
      path: COOKIE_PATH,
    });
  }
}

function toWebResponse(auth: Awaited<ReturnType<AuthService['login']>>): WebAuthResponse {
  return {
    user: auth.user,
    accessToken: auth.tokens.accessToken,
    accessTokenExpiresIn: auth.tokens.accessTokenExpiresIn,
  };
}
