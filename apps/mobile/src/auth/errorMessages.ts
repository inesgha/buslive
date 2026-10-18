import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@buslive/shared';
import type { TFunction } from 'i18next';

import { ApiError, NetworkError } from '@/api/errors';

/** Problème sur un champ, venant de zod (côté app) ou de l'API (réponse 400). */
export interface FieldIssue {
  path: string;
  code: string;
}

export type FieldErrors = Partial<Record<string, string>>;

/**
 * Traduit un problème de validation en message dans la langue de l'app.
 * Les messages des schémas partagés sont en français : on se base sur le
 * champ et le code zod (too_small, invalid_format…) pour afficher la bonne langue.
 */
export function translateIssue(issue: FieldIssue, t: TFunction): string {
  switch (issue.path) {
    case 'email':
      return t('auth.validation.email');
    case 'password':
      if (issue.code === 'too_big') {
        return t('auth.validation.passwordTooLong', { max: PASSWORD_MAX_LENGTH });
      }
      return t('auth.validation.passwordTooShort', { min: PASSWORD_MIN_LENGTH });
    case 'displayName':
      if (issue.code === 'too_big') {
        return t('auth.validation.displayNameTooLong', { max: DISPLAY_NAME_MAX_LENGTH });
      }
      if (issue.code === 'custom') return t('auth.validation.displayNameInvalid');
      return t('auth.validation.displayNameTooShort', { min: DISPLAY_NAME_MIN_LENGTH });
    default:
      return t('auth.validation.required');
  }
}

/** Problèmes renvoyés par zod (côté app) → format commun { path, code }. */
export function fromZodIssues(issues: { path: PropertyKey[]; code: string }[]): FieldIssue[] {
  return issues.map((issue) => ({ path: String(issue.path[0] ?? ''), code: issue.code }));
}

/** Un message par champ (le premier problème rencontré). */
export function toFieldErrors(issues: FieldIssue[], t: TFunction): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) errors[issue.path] ??= translateIssue(issue, t);
  return errors;
}

/** Message global pour une erreur d'envoi du formulaire de connexion / inscription. */
export function authErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof NetworkError) return t('common.networkError');
  if (error instanceof ApiError) {
    if (error.status === 401) return t('auth.errors.invalidCredentials');
    if (error.status === 409) return t('auth.errors.emailTaken');
    if (error.status === 429) return t('auth.errors.tooManyAttempts');
  }
  return t('common.genericError');
}
