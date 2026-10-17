import { jest } from '@jest/globals';
import { type ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { RateLimitOverride } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitStore } from './rate-limit.store';

class LoginController {
  login() {}
}

/** Faux contexte : requête venant de « ip », réponse qui mémorise ses en-têtes. */
function contextFor(ip: string, headers: Record<string, string> = {}): ExecutionContext {
  return {
    getHandler: () => LoginController.prototype.login,
    getClass: () => LoginController,
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
      getResponse: () => ({ setHeader: (name: string, value: string) => (headers[name] = value) }),
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  let reflector: Reflector;
  let store: RateLimitStore;
  let guard: RateLimitGuard;
  let now: number;

  const limitRoute = (override: RateLimitOverride | undefined) =>
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(override);

  beforeEach(() => {
    // Horloge contrôlée : on avance le temps à la main.
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    reflector = new Reflector();
    store = new RateLimitStore();
    guard = new RateLimitGuard(reflector, store, { max: 3, windowSeconds: 60 });
  });

  afterEach(() => jest.restoreAllMocks());

  it('ne limite pas une route sans @RateLimit', () => {
    limitRoute(undefined);
    for (let i = 0; i < 10; i++) expect(guard.canActivate(contextFor('1.1.1.1'))).toBe(true);
  });

  it('bloque au-delà de la limite avec 429 et Retry-After', () => {
    limitRoute({});
    for (let i = 0; i < 3; i++) expect(guard.canActivate(contextFor('1.1.1.1'))).toBe(true);

    now += 15_000;
    const headers: Record<string, string> = {};
    try {
      guard.canActivate(contextFor('1.1.1.1', headers));
      throw new Error('aurait dû être bloqué');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
    expect(headers['Retry-After']).toBe('45');
  });

  it('compte chaque adresse IP séparément', () => {
    limitRoute({});
    for (let i = 0; i < 3; i++) guard.canActivate(contextFor('1.1.1.1'));
    expect(guard.canActivate(contextFor('2.2.2.2'))).toBe(true);
  });

  it('rouvre l’accès à la fin de la fenêtre', () => {
    limitRoute({});
    for (let i = 0; i < 3; i++) guard.canActivate(contextFor('1.1.1.1'));
    expect(() => guard.canActivate(contextFor('1.1.1.1'))).toThrow(HttpException);

    now += 60_000;
    expect(guard.canActivate(contextFor('1.1.1.1'))).toBe(true);
  });

  it('applique les valeurs propres à la route', () => {
    limitRoute({ max: 1 });
    expect(guard.canActivate(contextFor('1.1.1.1'))).toBe(true);
    expect(() => guard.canActivate(contextFor('1.1.1.1'))).toThrow(HttpException);
  });

  it('nettoie les fenêtres expirées pour borner la mémoire', () => {
    limitRoute({});
    guard.canActivate(contextFor('1.1.1.1'));
    guard.canActivate(contextFor('2.2.2.2'));
    expect(store.size).toBe(2);

    now += 120_000;
    guard.canActivate(contextFor('3.3.3.3'));
    expect(store.size).toBe(1);
  });
});
