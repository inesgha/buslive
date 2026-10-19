import { formatMillimes, type ReportType } from '@buslive/shared';

/** Date et heure, toujours en heure de Tunis (le navigateur peut être ailleurs). */
const dateTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Tunis',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatDateTime(iso: string | null): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

export function formatPrice(millimes: number): string {
  return formatMillimes(millimes, 'fr');
}

/** Minutes depuis minuit → « 07:30 » ; null → chaîne vide (champ de formulaire). */
export function minutesToInput(minutes: number | null): string {
  if (minutes === null) return '';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** « 07:30 » → 450 ; vide → null ; invalide → undefined. */
export function inputToMinutes(value: string): number | null | undefined {
  if (value.trim() === '') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[2]) < 60 && minutes <= 1440 ? minutes : undefined;
}

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  NOT_CAME: 'Pas venu',
  PASSED: 'Bus passé',
  FULL: 'Plein',
  DELAYED: 'Retard',
  BREAKDOWN: 'Panne',
  STOP_MOVED: 'Arrêt déplacé',
};

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'En cours',
  CONFIRMED: 'Confirmé',
  REJECTED: 'Démenti',
  EXPIRED: 'Expiré',
  PENDING: 'En attente',
  ARCHIVED: 'Archivé',
  CANCELLED: 'Annulé',
};

export const ROLE_LABELS: Record<string, string> = {
  USER: 'Utilisateur',
  MODERATOR: 'Modérateur',
  ADMIN: 'Administrateur',
};
