import type { Role } from '@buslive/shared';
import type { Request } from 'express';

/** Contenu (« payload ») d'un access token JWT. */
export interface AccessTokenPayload {
  /** Identifiant de l'utilisateur (convention JWT : « subject »). */
  sub: string;
  /**
   * Rôle au moment de la connexion. Un changement de rôle prend effet au
   * prochain rafraîchissement du jeton (15 min au plus).
   */
  role: Role;
}

/** Utilisateur connecté, déduit de l'access token par JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/** Émetteur et destinataire inscrits dans les JWT, vérifiés à chaque requête. */
export const JWT_ISSUER = 'buslive-api';
export const JWT_AUDIENCE = 'buslive-app';
