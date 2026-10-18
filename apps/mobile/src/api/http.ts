import type { z } from 'zod';

import { ApiError, InvalidResponseError, NetworkError } from './errors';

/** Délai maximal d'une requête : au-delà, on considère le réseau indisponible. */
const TIMEOUT_MS = 15_000;

/**
 * Adresse de l'API, lue dans apps/mobile/.env (EXPO_PUBLIC_API_URL).
 * Expo remplace cette variable par sa valeur au moment du bundle.
 */
export function apiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error('EXPO_PUBLIC_API_URL manquante : crée apps/mobile/.env (voir .env.example).');
  }
  return url.replace(/\/+$/, '');
}

export interface HttpOptions<S extends z.ZodType | undefined> {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Schéma zod de la réponse. Sans schéma, la réponse est ignorée (ex. 204). */
  schema?: S;
  accessToken?: string | null;
}

type Result<S> = S extends z.ZodType ? z.output<S> : undefined;

/**
 * Requête HTTP vers l'API, SANS gestion de la connexion (voir client.ts).
 * La réponse est validée avec le schéma zod partagé : si l'API change de
 * format, l'erreur apparaît ici plutôt que dans un écran.
 */
export async function httpRequest<S extends z.ZodType | undefined = undefined>(
  path: string,
  options: HttpOptions<S> = {},
): Promise<Result<S>> {
  const { method = 'GET', body, schema, accessToken } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new NetworkError(error);
  } finally {
    clearTimeout(timeout);
  }

  const data: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => null);
  if (!response.ok) throw ApiError.fromBody(response.status, data);
  if (!schema) return undefined as Result<S>;

  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new InvalidResponseError(path, parsed.error.message);
  return parsed.data as Result<S>;
}
