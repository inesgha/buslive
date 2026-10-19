import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

import { useAuth } from '../auth/AuthProvider';
import { ROLE_LABELS } from '../lib/format';

/** Barre latérale de navigation + contenu de la page. */
export function Layout({ children }: { children: ReactNode }) {
  const { state, logout, can } = useAuth();
  const user = state.status === 'signedIn' ? state.user : null;
  const links = [
    { to: '/', label: 'Tableau de bord' },
    { to: '/reports', label: 'Signalements' },
    { to: '/stops', label: 'Arrêts' },
    { to: '/rides', label: 'Covoiturage' },
    { to: '/users', label: 'Comptes' },
    ...(can('ADMIN') ? [{ to: '/network', label: 'Réseau' }] : []),
    { to: '/log', label: 'Journal' },
  ];

  return (
    <div className="layout">
      <nav className="sidebar" aria-label="Navigation principale">
        <div className="brand">BusLive · Admin</div>
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.to === '/'}>
            {link.label}
          </NavLink>
        ))}
        <div className="spacer" />
        {user ? (
          <>
            <div>{user.displayName}</div>
            <div className="muted">{ROLE_LABELS[user.role]}</div>
            <button type="button" onClick={() => void logout()}>
              Se déconnecter
            </button>
          </>
        ) : null}
      </nav>
      <main>{children}</main>
    </div>
  );
}

/** Message d'erreur d'une action (l'API renvoie des messages en français). */
export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {error instanceof Error ? error.message : 'Une erreur est survenue.'}
    </p>
  );
}
