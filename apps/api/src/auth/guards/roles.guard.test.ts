import type { Role } from '@buslive/shared';
import { jest } from '@jest/globals';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RolesGuard } from './roles.guard';

function contextFor(role?: Role): ExecutionContext {
  const request = role ? { user: { id: 'u1', role } } : {};
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const requireRole = (role: Role | undefined) =>
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(role);

  afterEach(() => jest.restoreAllMocks());

  it('laisse passer une route sans @MinRole', () => {
    requireRole(undefined);
    expect(guard.canActivate(contextFor('USER'))).toBe(true);
  });

  it('accepte un ADMIN sur une route @MinRole(MODERATOR)', () => {
    requireRole('MODERATOR');
    expect(guard.canActivate(contextFor('ADMIN'))).toBe(true);
  });

  it('refuse un USER sur une route @MinRole(MODERATOR) (403)', () => {
    requireRole('MODERATOR');
    expect(() => guard.canActivate(contextFor('USER'))).toThrow(ForbiddenException);
  });

  it('refuse une requête sans utilisateur (403)', () => {
    requireRole('USER');
    expect(() => guard.canActivate(contextFor())).toThrow(ForbiddenException);
  });
});
