import i18n from 'i18next';

import { resources } from '@/i18n';

import { formatDistance, formatEta, formatNotificationTime, formatPassage } from './format';

beforeAll(async () => {
  await i18n.init({ resources, lng: 'fr', interpolation: { escapeValue: false } });
});

const monday0750 = { isoDate: '2026-10-19', minutes: 7 * 60 + 50 };

describe('formatDistance', () => {
  it.each([
    [0, '10 m'],
    [347, '350 m'],
    [999, '1 km'],
    [1234, '1,2 km'],
    [2950, '3 km'],
  ])('%i m → « %s » en français', async (meters, expected) => {
    await i18n.changeLanguage('fr');
    expect(formatDistance(meters, i18n.t)).toBe(expected);
  });

  it('utilise les unités arabes avec des chiffres latins', async () => {
    await i18n.changeLanguage('ar');
    expect(formatDistance(347, i18n.t)).toBe('350 م');
    expect(formatDistance(1234, i18n.t)).toBe('1,2 كم');
  });
});

describe('formatPassage', () => {
  beforeAll(() => i18n.changeLanguage('fr'));

  it.each([
    [{ serviceDate: '2026-10-19', passingMinutes: 7 * 60 + 50 }, 'Maintenant'],
    [{ serviceDate: '2026-10-19', passingMinutes: 8 * 60 + 2 }, 'dans 12 min'],
    [{ serviceDate: '2026-10-19', passingMinutes: 14 * 60 + 30 }, 'à 14:30'],
    [{ serviceDate: '2026-10-20', passingMinutes: 6 * 60 + 30 }, 'demain à 06:30'],
    // Départ « 24:30 » de la journée de lundi = mardi 00:30.
    [{ serviceDate: '2026-10-19', passingMinutes: 24 * 60 + 30 }, 'demain à 00:30'],
  ])('%o → « %s »', (passage, expected) => {
    expect(formatPassage(passage, monday0750, i18n.t)).toBe(expected);
  });

  it('traduit en arabe', async () => {
    await i18n.changeLanguage('ar');
    expect(
      formatPassage({ serviceDate: '2026-10-19', passingMinutes: 8 * 60 + 2 }, monday0750, i18n.t),
    ).toBe('بعد 12 د');
    expect(
      formatPassage(
        { serviceDate: '2026-10-19', passingMinutes: 14 * 60 + 30 },
        monday0750,
        i18n.t,
      ),
    ).toBe('على الساعة 14:30');
  });
});

describe('formatEta', () => {
  it('affiche « Maintenant » à l’arrêt et « dans N min » sinon', async () => {
    await i18n.changeLanguage('fr');
    expect(formatEta(0, i18n.t)).toBe('Maintenant');
    expect(formatEta(4, i18n.t)).toBe('dans 4 min');
    await i18n.changeLanguage('ar');
    expect(formatEta(4, i18n.t)).toBe('بعد 4 د');
  });
});

describe('formatNotificationTime', () => {
  it('donne l’heure de Tunis, et la date si ce n’est pas aujourd’hui', () => {
    // 06:32 UTC = 07:32 à Tunis.
    expect(formatNotificationTime('2026-10-19T06:32:00.000Z', monday0750)).toBe('07:32');
    expect(formatNotificationTime('2026-10-18T17:05:00.000Z', monday0750)).toBe('18/10 · 18:05');
  });
});
