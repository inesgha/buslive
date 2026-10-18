import { RegisterSchema } from '@buslive/shared';
import i18n from 'i18next';

import { ApiError, NetworkError } from '@/api/errors';
import { resources } from '@/i18n';

import { authErrorMessage, fromZodIssues, toFieldErrors } from './errorMessages';

beforeAll(async () => {
  await i18n.init({ resources, lng: 'fr', interpolation: { escapeValue: false } });
});

describe('toFieldErrors', () => {
  it('traduit les erreurs du schéma d’inscription en français et en arabe', async () => {
    const parsed = RegisterSchema.safeParse({ email: 'x', password: 'court', displayName: 'I' });
    if (parsed.success) throw new Error('aurait dû échouer');
    const issues = fromZodIssues(parsed.error.issues);

    await i18n.changeLanguage('fr');
    expect(toFieldErrors(issues, i18n.t)).toEqual({
      email: 'Adresse email invalide.',
      password: 'Au moins 8 caractères.',
      displayName: 'Au moins 2 caractères.',
    });

    await i18n.changeLanguage('ar');
    expect(toFieldErrors(issues, i18n.t).password).toBe('8 أحرف على الأقل.');
  });

  it('garde le premier problème de chaque champ', async () => {
    await i18n.changeLanguage('fr');
    const errors = toFieldErrors(
      [
        { path: 'password', code: 'too_big' },
        { path: 'password', code: 'too_small' },
      ],
      i18n.t,
    );
    expect(errors.password).toBe('Au plus 128 caractères.');
  });
});

describe('authErrorMessage', () => {
  beforeAll(() => i18n.changeLanguage('fr'));

  it.each([
    [new ApiError(401, ''), 'Email ou mot de passe incorrect.'],
    [new ApiError(409, ''), 'Un compte existe déjà avec cet email.'],
    [new ApiError(429, ''), 'Trop de tentatives. Réessaie dans quelques instants.'],
    [new NetworkError(), 'Impossible de joindre le serveur. Vérifie ta connexion.'],
    [new Error('autre'), 'Une erreur est survenue.'],
  ])('%s → message adapté', (error, expected) => {
    expect(authErrorMessage(error, i18n.t)).toBe(expected);
  });
});
