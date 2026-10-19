import type { ModerationActionType } from '@buslive/shared';
import { useQuery } from '@tanstack/react-query';

import { adminApi } from '../api/admin';
import { ErrorText } from '../components/Layout';
import { formatDateTime } from '../lib/format';

const ACTION_LABELS: Record<ModerationActionType, string> = {
  REPORT_CONFIRMED: 'Signalement confirmé',
  REPORT_REJECTED: 'Signalement démenti',
  REPORT_HIDDEN: 'Signalement masqué',
  STOP_MOVE_APPLIED: 'Déplacement d’arrêt appliqué',
  STOP_MOVE_DISMISSED: 'Déplacement d’arrêt classé',
  STOP_APPROVED: 'Arrêt proposé approuvé',
  STOP_REJECTED: 'Arrêt proposé refusé',
  STOP_UPDATED: 'Arrêt modifié',
  RIDE_CANCELLED: 'Covoiturage annulé',
  RIDE_FLAGS_DISMISSED: 'Signalements de covoiturage classés',
  USER_SUSPENDED: 'Compte suspendu',
  USER_REINSTATED: 'Compte réactivé',
  USER_ROLE_CHANGED: 'Rôle modifié',
  GOVERNORATE_UPDATED: 'Gouvernorat ouvert / fermé',
  LOUAGE_STATION_SAVED: 'Station de louage enregistrée',
  LOUAGE_STATION_ARCHIVED: 'Station de louage archivée',
};

/** Journal de modération : qui a fait quoi, quand (non modifiable). */
export function LogPage() {
  const log = useQuery({ queryKey: ['moderation-log'], queryFn: adminApi.moderationLog });
  return (
    <>
      <h1>Journal de modération</h1>
      <p className="muted">
        Chaque action y est écrite automatiquement. La base refuse toute modification ou suppression
        de ce journal.
      </p>
      <ErrorText error={log.error} />
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Action</th>
              <th>Par</th>
              <th>Détails</th>
            </tr>
          </thead>
          <tbody>
            {log.data?.map((action) => (
              <tr key={action.id}>
                <td>{formatDateTime(action.createdAt)}</td>
                <td>{ACTION_LABELS[action.type]}</td>
                <td>{action.moderator.displayName}</td>
                <td className="muted">
                  {action.targetType} {action.targetId.slice(0, 8)} ·{' '}
                  {Object.entries(action.details)
                    .map(([key, value]) => `${key} : ${String(value)}`)
                    .join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
