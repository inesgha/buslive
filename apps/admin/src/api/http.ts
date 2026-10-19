import { type UserProfile, type WebAuthResponse, WebAuthResponseSchema } from '@buslive/shared';
import type { z } from 'zod';

/**
 * Client HTTP du tableau de bord.
 *
 * Session : le refresh token est dans un cookie httpOnly posé par l'API
 * (illisible ici, même en cas de faille XSS). L'access token n'existe qu'en
 * mémoire : après un rechargement de la page, on le redemande avec le cookie.
 * Comme dans l'app mobile, UNE seule requête /refresh à la fois (l'API révoque
 * la session si le même refresh token sert deux fois).
 */

const BASE_URL = (import.meta.env.VITE_API_URL ?? '/api/v1').replace(/\/+$/, '');

/** L'API a répondu avec une erreur : son message est en français, prêt à afficher. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<UserProfile | null> | null = null;
type Listener = (user: UserProfile | null) => void;
const listeners = new Set<Listener>();

/** Prévenu quand la session change (connexion, expiration, déconnexion). */
export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setSession(auth: WebAuthResponse | null): UserProfile | null {
  accessToken = auth?.accessToken ?? null;
  for (const listener of listeners) listener(auth?.user ?? null);
  return auth?.user ?? null;
}

async function errorOf(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === 'string' ? body.message : `Erreur ${response.status}`;
  return new ApiError(response.status, message);
}

/** Requête d'authentification web (cookie envoyé grâce à credentials). */
async function authRequest(path: string, body?: unknown): Promise<Response> {
  return fetch(`${BASE_URL}/auth/web/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function login(email: string, password: string): Promise<UserProfile> {
  const response = await authRequest('login', { email, password });
  if (!response.ok) throw await errorOf(response);
  return setSession(WebAuthResponseSchema.parse(await response.json())) as UserProfile;
}

/** Reprend la session (rechargement de la page) ; null si elle a expiré. */
export function refresh(): Promise<UserProfile | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await authRequest('refresh');
      if (!response.ok) return setSession(null);
      return setSession(WebAuthResponseSchema.parse(await response.json()));
    } catch {
      return setSession(null);
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function logout(): Promise<void> {
  await authRequest('logout').catch(() => undefined);
  setSession(null);
}

export interface RequestOptions<S extends z.ZodType | undefined> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Schéma zod de la réponse (sans schéma : réponse ignorée, ex. 204). */
  schema?: S;
}

type Result<S> = S extends z.ZodType ? z.output<S> : undefined;

/**
 * Appel d'une route protégée. Access token absent ou expiré (401) : on le
 * renouvelle une fois, puis on rejoue la requête.
 */
export async function api<S extends z.ZodType | undefined = undefined>(
  path: string,
  options: RequestOptions<S> = {},
): Promise<Result<S>> {
  const send = () =>
    fetch(`${BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  if (!accessToken) await refresh();
  let response = await send();
  if (response.status === 401 && (await refresh())) response = await send();
  if (!response.ok) throw await errorOf(response);
  if (!options.schema || response.status === 204) return undefined as Result<S>;

  const parsed = options.schema.safeParse(await response.json());
  if (!parsed.success) throw new ApiError(0, `Réponse inattendue de ${path}.`);
  return parsed.data as Result<S>;
}
