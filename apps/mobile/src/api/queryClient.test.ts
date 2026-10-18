import { shouldPersistQuery } from './queryClient';

const query = (queryKey: unknown[], status: 'success' | 'error' | 'pending') =>
  ({ queryKey, state: { status } }) as unknown as Parameters<typeof shouldPersistQuery>[0];

describe('shouldPersistQuery', () => {
  it.each([
    [['lines'], true],
    [['line', 'abc'], true],
    [['nearbyStops', '35.498', '11.047'], true],
    [['stopDepartures', 'abc'], true],
  ])('sauvegarde %j quand la requête a réussi', (key, expected) => {
    expect(shouldPersistQuery(query(key, 'success'))).toBe(expected);
  });

  it('ne sauvegarde pas une requête en erreur ou en cours', () => {
    expect(shouldPersistQuery(query(['lines'], 'error'))).toBe(false);
    expect(shouldPersistQuery(query(['lines'], 'pending'))).toBe(false);
  });

  it('ne sauvegarde pas les autres données (ex. données personnelles)', () => {
    expect(shouldPersistQuery(query(['me'], 'success'))).toBe(false);
  });
});
