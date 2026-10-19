import { ROLES, type Role } from '@buslive/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { adminApi } from '../api/admin';
import { useAuth } from '../auth/AuthProvider';
import { ErrorText } from '../components/Layout';
import { formatDateTime, ROLE_LABELS } from '../lib/format';

/** Comptes : recherche, suspension, rôles (administrateurs). */
export function UsersPage() {
  const queryClient = useQueryClient();
  const { can, state } = useAuth();
  const myId = state.status === 'signedIn' ? state.user.id : null;
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const users = useQuery({ queryKey: ['users', q], queryFn: () => adminApi.users(q || undefined) });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['users'] });
  const suspend = useMutation({
    mutationFn: ({ id, suspended }: { id: string; suspended: boolean }) =>
      adminApi.suspend(id, suspended),
    onSuccess: refresh,
  });
  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => adminApi.changeRole(id, role),
    onSuccess: refresh,
  });

  return (
    <>
      <h1>Comptes</h1>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim());
        }}
      >
        <input
          aria-label="Rechercher un compte"
          placeholder="Email ou nom"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="submit">Rechercher</button>
      </form>
      <p className="muted">
        Suspendre révoque toutes les sessions du compte : il ne peut plus se connecter. Un
        modérateur ne peut agir que sur un compte de rôle inférieur au sien.
      </p>
      <ErrorText error={users.error ?? suspend.error ?? changeRole.error} />
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Compte</th>
              <th>Rôle</th>
              <th>Confiance</th>
              <th>Activité</th>
              <th>Créé</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.data?.map((user) => (
              <tr key={user.id}>
                <td>
                  {user.displayName}
                  <div className="muted">{user.email}</div>
                  {user.suspendedAt ? <span className="badge danger">suspendu</span> : null}
                </td>
                <td>
                  {can('ADMIN') && user.id !== myId ? (
                    <select
                      aria-label={`Rôle de ${user.displayName}`}
                      value={user.role}
                      onChange={(event) =>
                        changeRole.mutate({ id: user.id, role: event.target.value as Role })
                      }
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    ROLE_LABELS[user.role]
                  )}
                </td>
                <td>{user.trustScore}</td>
                <td className="muted">
                  {user.reports} signalement(s) · {user.rideOffers} trajet(s)
                  {user.hasPhone ? ' · téléphone renseigné' : ''}
                </td>
                <td>{formatDateTime(user.createdAt)}</td>
                <td>
                  {user.id === myId ? null : (
                    <button
                      type="button"
                      className={user.suspendedAt ? '' : 'danger'}
                      onClick={() =>
                        suspend.mutate({ id: user.id, suspended: user.suspendedAt === null })
                      }
                    >
                      {user.suspendedAt ? 'Réactiver' : 'Suspendre'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
