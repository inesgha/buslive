import { jest } from '@jest/globals';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import type { AuthenticatedRequest } from '../auth.types';
import { extractBearerToken, JwtAuthGuard } from './jwt-auth.guard';

/** Construit un faux contexte d'exécution autour d'une requête HTTP. */
function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: 'x'.repeat(32) });
  const reflector = new Reflector();
  const guard = new JwtAuthGuard(jwt, reflector);

  afterEach(() => jest.restoreAllMocks());

  it('laisse passer une route @Public sans jeton', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
  });

  it('sur une route @Public, reconnaît l’utilisateur si son jeton est valide', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const token = await jwt.signAsync({ sub: 'u1', role: 'USER' });
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${token}` },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'u1', role: 'USER' });
  });

  it('sur une route @Public, ignore un jeton invalide sans refuser l’accès', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer abc.def.ghi' },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('refuse une route protégée sans jeton (401)', async () => {
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuse un jeton signé avec une autre clé (401)', async () => {
    const forged = await new JwtService({ secret: 'y'.repeat(32) }).signAsync({ sub: 'u1' });
    const request = { headers: { authorization: `Bearer ${forged}` } };
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(UnauthorizedException);
  });

  it('accepte un jeton valide et place l’utilisateur dans request.user', async () => {
    const token = await jwt.signAsync({ sub: 'u1', role: 'USER' });
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${token}` },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'u1', role: 'USER' });
  });
});

describe('extractBearerToken', () => {
  it.each([
    ['Bearer abc', 'abc'],
    ['bearer abc', 'abc'],
    ['Basic abc', undefined],
    ['Bearer', undefined],
    [undefined, undefined],
  ])('« %s » → %s', (header, expected) => {
    expect(extractBearerToken(header)).toBe(expected);
  });
});
