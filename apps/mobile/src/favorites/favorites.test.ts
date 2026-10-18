import type { Favorites, LineSummary } from '@buslive/shared';

import { applyFavoriteToggle } from './favorites';

const line: LineSummary = {
  id: '0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d',
  code: '10',
  nameFr: 'Mahdia – Ksour Essef',
  nameAr: 'المهدية – قصور الساف',
  type: 'SUBURBAN',
  color: '#0E7490',
  governorateCode: 'TN-53',
  operator: null,
  directions: [],
};
const empty: Favorites = { lines: [], stops: [] };

describe('applyFavoriteToggle', () => {
  it('ajoute la ligne tout de suite (avant la réponse de l’API)', () => {
    expect(
      applyFavoriteToggle(empty, { kind: 'lines', id: line.id, favorite: true, line }),
    ).toEqual({ lines: [line], stops: [] });
  });

  it('ne crée pas de doublon et retire un favori', () => {
    const once = applyFavoriteToggle(
      { ...empty, lines: [line] },
      {
        kind: 'lines',
        id: line.id,
        favorite: true,
        line,
      },
    );
    expect(once?.lines).toHaveLength(1);
    expect(applyFavoriteToggle(once, { kind: 'lines', id: line.id, favorite: false })).toEqual(
      empty,
    );
  });

  it('ne fait rien tant que la liste n’est pas chargée', () => {
    expect(
      applyFavoriteToggle(undefined, { kind: 'stops', id: 'x', favorite: true }),
    ).toBeUndefined();
  });
});
