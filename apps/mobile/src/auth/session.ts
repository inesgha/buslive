import { type AuthResponse, AuthResponseSchema, type UserProfile } from '@buslive/shared';

import { ApiError } from '@/api/errors';
import { httpRequest } from '@/api/http';

import {
  deleteCachedProfile,
  deleteRefreshToken,
  loadCachedProfile,
  loadRefreshToken,
  saveCachedProfile,
  saveRefreshToken,
} from './tokenStorage';

/**
 * Session de l'utilisateur, indépendante de React (utilisée par le client API).
 *
 * RÈGLE IMPORTANTE : une seule requête /auth/refresh à la fois. L'API remplace
 * le refresh token à chaque utilisation ; si deux requêtes envoyaient le même
 * jeton en parallèle, la seconde serait prise pour un vol et toute la session
 * serait révoquée. Les appels simultanés partagent donc la même promesse.
 */

type Listener = (user: UserProfile | null) => void;

let accessToken: string | null = null;
let refreshInFlight: Promise<AuthResponse | null> | null = null;
const listeners = new Set<Listener>();

function notify(user: UserProfile | null): void {
  for (const listener of listeners) listener(user);
}

export const session = {
  getAccessToken(): string | null {
    return accessToken;
  },

  /** Abonnement aux changements (connexion, déconnexion, session expirée). */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Après une connexion, une inscription ou un rafraîchissement réussi. */
  async start(response: AuthResponse): Promise<void> {
    accessToken = response.tokens.accessToken;
    await saveRefreshToken(response.tokens.refreshToken);
    await saveCachedProfile(response.user);
    notify(response.user);
  },

  /** Profil modifié (langue, préférences) : mis à jour en cache et à l'écran. */
  async updateProfile(user: UserProfile): Promise<void> {
    await saveCachedProfile(user);
    notify(user);
  },

  /** Oublie tout (déconnexion ou session révoquée). */
  async clear(): Promise<void> {
    accessToken = null;
    await deleteRefreshToken();
    await deleteCachedProfile();
    notify(null);
  },

  /**
   * Obtient de nouveaux jetons. Renvoie null si la session n'est plus valide
   * (l'utilisateur doit se reconnecter). Les appels simultanés sont regroupés.
   */
  refresh(): Promise<AuthResponse | null> {
    refreshInFlight ??= doRefresh().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  },

  /**
   * Au démarrage de l'app : tente de reprendre la session enregistrée.
   * Hors ligne, on garde la session et on affiche le profil mis en cache.
   */
  async restore(): Promise<UserProfile | null> {
    if (!(await loadRefreshToken())) return null;
    try {
      return (await session.refresh())?.user ?? null;
    } catch {
      // Réseau indisponible : la session n'est pas forcément expirée.
      return loadCachedProfile();
    }
  },
};

async function doRefresh(): Promise<AuthResponse | null> {
  const refreshToken = await loadRefreshToken();
  if (!refreshToken) return null;
  try {
    const response = await httpRequest('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      schema: AuthResponseSchema,
    });
    await session.start(response);
    return response;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // Jeton expiré, révoqué ou réutilisé : il faut se reconnecter.
      await session.clear();
      return null;
    }
    throw error;
  }
}
