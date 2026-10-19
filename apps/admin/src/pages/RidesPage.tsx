import type { ResolveRideFlagsInput, RideFlagReason } from '@buslive/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminApi } from '../api/admin';
import { ErrorText } from '../components/Layout';
import { formatDateTime, STATUS_LABELS } from '../lib/format';

const REASONS: Record<RideFlagReason, string> = {
  FAKE: 'faux trajet',
  UNSAFE: 'dangereux',
  INAPPROPRIATE: 'inapproprié',
};

/** Trajets de covoiturage signalés par les utilisateurs. */
export function RidesPage() {
  const queryClient = useQueryClient();
  const flags = useQuery({ queryKey: ['ride-flags'], queryFn: adminApi.rideFlags });
  const resolve = useMutation({
    mutationFn: ({ offerId, action }: { offerId: string } & ResolveRideFlagsInput) =>
      adminApi.resolveRideFlags(offerId, { action }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ride-flags'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <>
      <h1>Covoiturage signalé</h1>
      <p className="muted">
        Annuler le trajet prévient les passagers. Pour un abus répété, suspendre le compte du
        conducteur (page Comptes).
      </p>
      <ErrorText error={flags.error ?? resolve.error} />
      <div className="card">
        {flags.data?.length === 0 ? (
          <p className="muted">Aucun trajet signalé.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Trajet</th>
                <th>Conducteur</th>
                <th>Signalements</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {flags.data?.map((flag) => (
                <tr key={flag.offerId}>
                  <td>
                    {flag.from.nameFr} → {flag.to.nameFr}
                    <div className="muted">{formatDateTime(flag.departureAt)}</div>
                  </td>
                  <td>
                    {flag.driver.displayName}
                    <div className="muted">score {flag.driver.trustScore}</div>
                  </td>
                  <td>
                    {flag.total} :{' '}
                    {flag.flags.map((f) => `${REASONS[f.reason]} (${f.count})`).join(', ')}
                  </td>
                  <td>
                    <span className="badge">{STATUS_LABELS[flag.status]}</span>
                  </td>
                  <td>
                    <div className="row">
                      {flag.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          className="danger"
                          onClick={() =>
                            resolve.mutate({ offerId: flag.offerId, action: 'CANCEL' })
                          }
                        >
                          Annuler le trajet
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => resolve.mutate({ offerId: flag.offerId, action: 'DISMISS' })}
                      >
                        Classer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
