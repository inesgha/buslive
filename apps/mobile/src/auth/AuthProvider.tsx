import type { LoginInput, RegisterInput, UserProfile } from '@buslive/shared';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import * as authApi from '@/api/auth';

import { session } from './session';
import { loadRefreshToken } from './tokenStorage';

type AuthState =
  { status: 'restoring' } | { status: 'signedOut' } | { status: 'signedIn'; user: UserProfile };

interface AuthContextValue {
  state: AuthState;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'restoring' });

  useEffect(() => {
    // Toute évolution de la session (y compris une expiration détectée par le
    // client API) met l'écran à jour.
    const unsubscribe = session.subscribe((user) =>
      setState(user ? { status: 'signedIn', user } : { status: 'signedOut' }),
    );
    void session
      .restore()
      .then((user) => setState(user ? { status: 'signedIn', user } : { status: 'signedOut' }));
    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login: async (input) => session.start(await authApi.login(input)),
      register: async (input) => session.start(await authApi.register(input)),
      logout: async () => {
        const refreshToken = await loadRefreshToken();
        await session.clear();
        // Révocation côté serveur « au mieux » : hors ligne, on est quand même
        // déconnecté sur le téléphone, et le jeton expirera de lui-même.
        if (refreshToken) void authApi.logout(refreshToken).catch(() => undefined);
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return context;
}
