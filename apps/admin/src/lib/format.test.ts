import { describe, expect, it } from 'vitest';

import { formatDateTime, formatPrice, inputToMinutes, minutesToInput } from './format';

describe('formatage', () => {
  it('affiche l’heure de Tunis, quel que soit le fuseau du navigateur', () => {
    // 06:30 UTC = 07:30 à Tunis.
    expect(formatDateTime('2026-10-19T06:30:00.000Z')).toBe('19/10/2026 07:30');
    expect(formatDateTime(null)).toBe('—');
  });

  it('écrit les prix en dinars', () => {
    expect(formatPrice(5500)).toBe('5,500 DT');
  });

  it('convertit les heures saisies', () => {
    expect(minutesToInput(330)).toBe('05:30');
    expect(minutesToInput(null)).toBe('');
    expect(inputToMinutes('05:30')).toBe(330);
    expect(inputToMinutes('')).toBeNull();
    expect(inputToMinutes('25:99')).toBeUndefined();
  });
});
