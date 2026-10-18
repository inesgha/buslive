import type { z } from 'zod';

import { session } from '@/auth/session';

import { ApiError } from './errors';
import { type HttpOptions, httpRequest } from './http';

export interface ApiOptions<S extends z.ZodType | undefined> extends Omit<
  HttpOptions<S>,
  'accessToken'
> {
  /** Route protégée : envoie l'access token (et le renouvelle si besoin). */
  auth?: boolean;
}

/**
 * Point d'entrée des appels à l'API depuis les écrans.
 * Pour une route protégée : si l'access token est absent ou expiré (401), on le
 * renouvelle UNE fois (requête /auth/refresh partagée) puis on rejoue la requête.
 */
export async function apiRequest<S extends z.ZodType | undefined = undefined>(
  path: string,
  options: ApiOptions<S> = {},
) {
  const { auth = false, ...httpOptions } = options;
  if (!auth) return httpRequest(path, httpOptions);

  const token = session.getAccessToken() ?? (await session.refresh())?.tokens.accessToken;
  if (!token) throw new ApiError(401, 'Authentification requise.');

  try {
    return await httpRequest(path, { ...httpOptions, accessToken: token });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const refreshed = await session.refresh();
    if (!refreshed) throw error;
    return httpRequest(path, { ...httpOptions, accessToken: refreshed.tokens.accessToken });
  }
}
