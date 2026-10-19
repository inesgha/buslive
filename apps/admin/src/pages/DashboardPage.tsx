import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { adminApi } from '../api/admin';
import { ErrorText } from '../components/Layout';
import { STATUS_LABELS } from '../lib/format';

/** Chiffres clés et files de modération. */
export function DashboardPage() {
  const { data, error, isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: adminApi.dashboard,
    refetchInterval: 60_000,
  });

  if (isPending) return <p>Chargement…</p>;
  if (!data) return <ErrorText error={error} />;

  const queues = [
    { label: 'Signalements contestés', value: data.queues.contestedReports, to: '/reports' },
    { label: 'Arrêts déplacés', value: data.queues.stopMoves, to: '/stops' },
    { label: 'Arrêts proposés', value: data.queues.stopProposals, to: '/stops' },
    { label: 'Covoiturages signalés', value: data.queues.rideFlags, to: '/rides' },
  ];
  const stats = [
    { label: 'Comptes', value: data.users.total, hint: `+${data.users.newLast7Days} en 7 jours` },
    { label: 'Comptes suspendus', value: data.users.suspended },
    { label: 'Partages en direct', value: data.live.activeSessions, hint: 'en ce moment' },
    {
      label: 'Signalements (24 h)',
      value: data.reports.last24h,
      hint: `${data.reports.last7Days} en 7 jours`,
    },
    {
      label: 'Covoiturages à venir',
      value: data.rides.upcoming,
      hint: `${data.rides.requestsLast7Days} demandes en 7 jours`,
    },
    { label: 'Notifications (24 h)', value: data.notifications.last24h },
  ];

  return (
    <>
      <h1>Tableau de bord</h1>
      <h2>À traiter</h2>
      <div className="grid">
        {queues.map((queue) => (
          <Link key={queue.label} to={queue.to} className="card" style={{ textDecoration: 'none' }}>
            <div className="stat">{queue.value}</div>
            <div className="muted">{queue.label}</div>
          </Link>
        ))}
      </div>

      <h2>Usage</h2>
      <div className="grid">
        {stats.map((stat) => (
          <div key={stat.label} className="card">
            <div className="stat">{stat.value}</div>
            <div>{stat.label}</div>
            {stat.hint ? <div className="muted">{stat.hint}</div> : null}
          </div>
        ))}
      </div>

      <h2>Signalements des 7 derniers jours</h2>
      <div className="card row">
        {Object.entries(data.reports.byStatus).map(([status, count]) => (
          <span key={status} className="badge">
            {STATUS_LABELS[status] ?? status} : {count}
          </span>
        ))}
      </div>
      <p className="muted">
        Une part élevée de signalements démentis ou expirés indique des règles de confiance
        (TRUST_RULES) à ajuster.
      </p>

      <h2>Lignes les plus signalées (7 jours)</h2>
      <div className="card">
        {data.topReportedLines.length === 0 ? (
          <p className="muted">Aucun signalement.</p>
        ) : (
          <table>
            <tbody>
              {data.topReportedLines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <span className="badge" style={{ borderColor: line.color }}>
                      {line.code}
                    </span>
                  </td>
                  <td>{line.nameFr}</td>
                  <td>{line.reports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
