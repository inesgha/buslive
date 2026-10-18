import type { AuthResponse } from '@buslive/shared';
import { z } from 'zod';

import { session } from '@/auth/session';
import { loadRefreshToken, saveRefreshToken } from '@/auth/tokenStorage';

import { apiRequest } from './client';
import { ApiError, InvalidResponseError, NetworkError } from './errors';

/** Réponse HTTP simulée. */
function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function authResponse(refreshToken: string, accessToken: string): AuthResponse {
  return {
    user: {
      id: '7b0f2c4e-8f43-4d8a-9e0b-3c1a2b4d5e6f',
      email: 'ines@example.tn',
      displayName: 'Inès',
      role: 'USER',
      locale: 'fr',
      phone: null,
      createdAt: '2026-10-18T10:00:00.000Z',
    },
    tokens: {
      accessToken,
      accessTokenExpiresIn: 900,
      refreshToken,
      refreshTokenExpiresAt: '2026-11-17T10:00:00.000Z',
    },
  };
}

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit?]>();
const MeSchema = z.object({ email: z.string() });

beforeEach(async () => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  await session.clear();
});

describe('apiRequest', () => {
  it('valide la réponse avec le schéma zod', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { email: 'a@b.tn' }));
    await expect(apiRequest('/x', { schema: MeSchema })).resolves.toEqual({ email: 'a@b.tn' });
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/v1/x', expect.anything());
  });

  it('rejette une réponse mal formée', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { email: 42 }));
    await expect(apiRequest('/x', { schema: MeSchema })).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
  });

  it('transforme une erreur HTTP en ApiError avec le détail des champs', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        message: 'Données invalides.',
        errors: [{ path: 'email', code: 'invalid_format', message: '…' }],
      }),
    );
    const error = await apiRequest('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).issues[0]?.path).toBe('email');
  });

  it('signale un serveur injoignable par une NetworkError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(apiRequest('/x')).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('apiRequest sur une route protégée', () => {
  it('renouvelle l’access token UNE seule fois pour des requêtes simultanées', async () => {
    await saveRefreshToken('refresh-1');
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith('/auth/refresh'))
        return jsonResponse(200, authResponse('refresh-2', 'access-2'));
      const authorization = (init?.headers as Record<string, string>).Authorization;
      return authorization === 'Bearer access-2'
        ? jsonResponse(200, { email: 'ines@example.tn' })
        : jsonResponse(401, { message: 'Jeton invalide ou expiré.' });
    });

    // Trois écrans demandent des données protégées en même temps, sans access token.
    const results = await Promise.all([
      apiRequest('/me', { auth: true, schema: MeSchema }),
      apiRequest('/me', { auth: true, schema: MeSchema }),
      apiRequest('/me', { auth: true, schema: MeSchema }),
    ]);

    expect(results).toHaveLength(3);
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
    // Le nouveau refresh token (rotation) est bien enregistré.
    await expect(loadRefreshToken()).resolves.toBe('refresh-2');
  });

  it('déconnecte si la session est révoquée (refresh → 401)', async () => {
    await saveRefreshToken('refresh-revoque');
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Session expirée.' }));
    const listener = jest.fn();
    const unsubscribe = session.subscribe(listener);

    await expect(apiRequest('/me', { auth: true, schema: MeSchema })).rejects.toBeInstanceOf(
      ApiError,
    );
    await expect(loadRefreshToken()).resolves.toBeNull();
    expect(listener).toHaveBeenCalledWith(null);
    unsubscribe();
  });
});
