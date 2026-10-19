import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const user = {
  id: '7b0f2c4e-8f43-4d8a-9e0b-3c1a2b4d5e6f',
  email: 'modo@example.tn',
  displayName: 'Modo',
  role: 'MODERATOR',
  locale: 'fr',
  phone: null,
  notifyReportOutcome: true,
  createdAt: '2026-10-19T10:00:00.000Z',
};
const session = (accessToken: string) => ({ user, accessToken, accessTokenExpiresIn: 900 });
const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Module neuf à chaque test : l'access token est gardé en mémoire dans le module. */
async function loadHttp() {
  vi.resetModules();
  return import('./http');
}

describe('client HTTP de l’admin', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('reprend la session avec le cookie, puis envoie l’access token', async () => {
    const http = await loadHttp();
    fetchMock
      .mockResolvedValueOnce(json(200, session('jeton-1')))
      .mockResolvedValueOnce(json(200, { ok: true }));

    await expect(
      http.api('/admin/dashboard', { schema: z.object({ ok: z.boolean() }) }),
    ).resolves.toEqual({
      ok: true,
    });
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[0]!;
    expect(refreshUrl).toBe('/api/v1/auth/web/refresh');
    // Le cookie httpOnly n'est envoyé que grâce à « credentials: include ».
    expect(refreshInit).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(fetchMock.mock.calls[1]![1].headers.Authorization).toBe('Bearer jeton-1');
  });

  it('access token expiré (401) : un seul rafraîchissement, puis la requête est rejouée', async () => {
    const http = await loadHttp();
    fetchMock
      .mockResolvedValueOnce(json(200, session('ancien')))
      .mockResolvedValueOnce(json(401, { message: 'Expiré' }))
      .mockResolvedValueOnce(json(200, session('nouveau')))
      .mockResolvedValueOnce(json(204, undefined));

    await http.api('/admin/reports/x/decision', { method: 'POST', body: { decision: 'HIDE' } });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3]![1].headers.Authorization).toBe('Bearer nouveau');
  });

  it('les rafraîchissements simultanés partagent UNE seule requête', async () => {
    const http = await loadHttp();
    fetchMock.mockResolvedValue(json(200, session('jeton')));
    await Promise.all([http.refresh(), http.refresh(), http.refresh()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('transmet le message d’erreur de l’API', async () => {
    const http = await loadHttp();
    fetchMock.mockResolvedValueOnce(json(403, { message: 'Accès réservé aux modérateurs.' }));
    await expect(http.login('usager@example.tn', 'x')).rejects.toMatchObject({
      status: 403,
      message: 'Accès réservé aux modérateurs.',
    });
  });
});
