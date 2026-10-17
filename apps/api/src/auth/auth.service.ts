import type { AuthResponse, LoginInput, RegisterInput, UserProfile } from '@buslive/shared';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { Env } from '../config/env.schema';
import { Prisma, type User } from '../generated/prisma/client';
import { UsersService } from '../users/users.service';
import type { AccessTokenPayload } from './auth.types';
import { PasswordService } from './password.service';
import { type IssuedRefreshToken, RefreshTokenService } from './refresh-token.service';

/** Message unique pour un email inconnu OU un mauvais mot de passe. */
const INVALID_CREDENTIALS = 'Email ou mot de passe incorrect.';

@Injectable()
export class AuthService {
  private readonly accessTokenTtl: number;

  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.accessTokenTtl = config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  async register(input: RegisterInput, userAgent?: string): Promise<AuthResponse> {
    if (await this.users.findByEmail(input.email)) {
      throw emailTaken();
    }

    const passwordHash = await this.passwords.hash(input.password);
    let user: User;
    try {
      user = await this.users.create({
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        locale: input.locale,
      });
    } catch (error) {
      // Deux inscriptions simultanées avec le même email : la contrainte
      // d'unicité de la base tranche (code Prisma P2002).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw emailTaken();
      }
      throw error;
    }

    return this.buildAuthResponse(user, await this.refreshTokens.issue(user.id, userAgent));
  }

  async login(input: LoginInput, userAgent?: string): Promise<AuthResponse> {
    const user = await this.users.findByEmail(input.email);
    const valid = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verifyDummy(input.password);

    if (!user || !valid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return this.buildAuthResponse(user, await this.refreshTokens.issue(user.id, userAgent));
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<AuthResponse> {
    const rotated = await this.refreshTokens.rotate(refreshToken, userAgent);
    const user = await this.users.findById(rotated.userId);
    if (!user) {
      throw new UnauthorizedException('Session expirée ou invalide. Reconnecte-toi.');
    }
    return this.buildAuthResponse(user, rotated);
  }

  logout(refreshToken: string): Promise<void> {
    return this.refreshTokens.revokeSession(refreshToken);
  }

  async me(userId: string): Promise<UserProfile> {
    const user = await this.users.findById(userId);
    if (!user) {
      // Compte supprimé alors que l'access token était encore valide.
      throw new UnauthorizedException('Compte introuvable.');
    }
    return this.users.toProfile(user);
  }

  private async buildAuthResponse(user: User, refresh: IssuedRefreshToken): Promise<AuthResponse> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    return {
      user: this.users.toProfile(user),
      tokens: {
        accessToken: await this.jwt.signAsync(payload),
        accessTokenExpiresIn: this.accessTokenTtl,
        refreshToken: refresh.token,
        refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
      },
    };
  }
}

function emailTaken(): ConflictException {
  return new ConflictException('Un compte existe déjà avec cet email.');
}
