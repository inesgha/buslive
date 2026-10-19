import type { ModerateReportInput } from '@buslive/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { adminApi } from '../api/admin';
import { ErrorText } from '../components/Layout';
import { formatDateTime, REPORT_TYPE_LABELS, STATUS_LABELS } from '../lib/format';

/** Signalements : contestés (à examiner) ou par statut. */
export function ReportsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>('contested');
  const contested = filter === 'contested';
  const reports = useQuery({
    queryKey: ['reports', filter],
    queryFn: () => adminApi.reports(contested ? { contested } : { status: filter || undefined }),
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string } & ModerateReportInput) =>
      adminApi.moderateReport(id, { decision }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <>
      <h1>Signalements</h1>
      <div className="row">
        <label>
          Afficher
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="contested">À examiner (contestés ou cachés)</option>
            <option value="ACTIVE">En cours</option>
            <option value="CONFIRMED">Confirmés</option>
            <option value="REJECTED">Démentis</option>
            <option value="">Tous</option>
          </select>
        </label>
      </div>
      <p className="muted">
        Confirmer ou démentir verse les points comme un vote (une seule fois). Masquer retire le
        signalement de l’app sans toucher aux points.
      </p>
      <ErrorText error={reports.error ?? decide.error} />
      <div className="card">
        {reports.isPending ? (
          <p>Chargement…</p>
        ) : reports.data?.length === 0 ? (
          <p className="muted">Rien à afficher.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Ligne / arrêt</th>
                <th>Auteur</th>
                <th>Avis (poids)</th>
                <th>Statut</th>
                <th>Envoyé</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reports.data?.map((report) => (
                <tr key={report.id}>
                  <td>
                    {REPORT_TYPE_LABELS[report.type]}
                    {report.delayMinutes ? ` (${report.delayMinutes} min)` : ''}
                  </td>
                  <td>
                    {report.line.code} · {report.direction?.headsignFr ?? '—'}
                    <div className="muted">{report.stop?.nameFr ?? ''}</div>
                  </td>
                  <td>
                    {report.author ? (
                      <>
                        {report.author.displayName}
                        <div className="muted">score {report.author.trustScore}</div>
                      </>
                    ) : (
                      <span className="muted">compte supprimé</span>
                    )}
                  </td>
                  <td>
                    pour {report.confirmations} ({report.confirmWeight.toFixed(1)}) · contre{' '}
                    {report.denials} ({report.denyWeight.toFixed(1)})
                  </td>
                  <td>
                    <span className="badge">{STATUS_LABELS[report.status]}</span>
                    {report.hidden ? <span className="badge warn">caché</span> : null}
                  </td>
                  <td>{formatDateTime(report.createdAt)}</td>
                  <td>
                    <div className="row">
                      {report.status === 'ACTIVE' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => decide.mutate({ id: report.id, decision: 'CONFIRM' })}
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            onClick={() => decide.mutate({ id: report.id, decision: 'REJECT' })}
                          >
                            Démentir
                          </button>
                        </>
                      ) : null}
                      {report.hidden ? null : (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => decide.mutate({ id: report.id, decision: 'HIDE' })}
                        >
                          Masquer
                        </button>
                      )}
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
