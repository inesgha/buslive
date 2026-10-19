import { hasMinRole, type Role, type UserProfile } from '@buslive/shared';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import * as http from '../api/http';

type AuthState =
  { status: 'restoring' } | { status: 'signedOut' } | { status: 'signedIn'; user: UserProfile };

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Le compte connecté a-t-il au moins ce rôle ? */
  can: (role: Role) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'restoring' });

  useEffect(() => {
    const apply = (user: UserProfile | null) =>
      setState(user ? { status: 'signedIn', user } : { status: 'signedOut' });
    const unsubscribe = http.onSessionChange(apply);
    // Rechargement de la page : on reprend la session grâce au cookie.
    void http.refresh().then(apply);
    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login: async (email, password) => {
        await http.login(email, password);
      },
      logout: () => http.logout(),
      can: (role) => state.status === 'signedIn' && hasMinRole(state.user.role, role),
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
