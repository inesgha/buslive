import {
  type AuthResponse,
  AuthResponseSchema,
  type LoginInput,
  type RegisterInput,
} from '@buslive/shared';

import { httpRequest } from './http';

export function login(input: LoginInput): Promise<AuthResponse> {
  return httpRequest('/auth/login', { method: 'POST', body: input, schema: AuthResponseSchema });
}

export function register(input: RegisterInput): Promise<AuthResponse> {
  return httpRequest('/auth/register', { method: 'POST', body: input, schema: AuthResponseSchema });
}

/** Révoque la session côté serveur (répond toujours 204). */
export function logout(refreshToken: string): Promise<undefined> {
  return httpRequest('/auth/logout', { method: 'POST', body: { refreshToken } });
}
