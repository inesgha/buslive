import type { NearbyStop } from '@buslive/shared';

import { buildProposalInput, isCloseEnough, linesAround } from './proposalForm';

const point = { latitude: 35.501, longitude: 11.05 };
const line = (id: string, code: string) => ({ id, code, color: '#0E7490' });
const stop = (lines: ReturnType<typeof line>[]) => ({ lines }) as unknown as NearbyStop;

describe('isCloseEnough', () => {
  it('exige d’être sur place (moins de 150 m)', () => {
    expect(isCloseEnough({ latitude: 35.5015, longitude: 11.05 }, point)).toBe(true); // ~55 m
    expect(isCloseEnough({ latitude: 35.51, longitude: 11.05 }, point)).toBe(false); // ~1 km
    expect(isCloseEnough(null, point)).toBe(false);
  });
});

describe('linesAround', () => {
  it('rassemble les lignes des arrêts voisins, sans doublon, dans l’ordre des numéros', () => {
    const ten = line('0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d', '10');
    const two = line('1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', '2');
    expect(linesAround([stop([ten, two]), stop([ten])]).map((l) => l.code)).toEqual(['2', '10']);
  });
});

describe('buildProposalInput', () => {
  it('construit la proposition, sans nom arabe s’il est vide', () => {
    expect(buildProposalInput({ nameFr: 'Hiboun', nameAr: ' ', lineIds: [] }, point, 12)).toEqual({
      nameFr: 'Hiboun',
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: 12,
      lineIds: [],
    });
  });

  it('refuse un nom trop court ou une position GPS inconnue ou imprécise', () => {
    expect(buildProposalInput({ nameFr: 'H', nameAr: '', lineIds: [] }, point, 12)).toBeNull();
    expect(
      buildProposalInput({ nameFr: 'Hiboun', nameAr: '', lineIds: [] }, point, null),
    ).toBeNull();
    expect(
      buildProposalInput({ nameFr: 'Hiboun', nameAr: '', lineIds: [] }, point, 300),
    ).toBeNull();
  });
});
