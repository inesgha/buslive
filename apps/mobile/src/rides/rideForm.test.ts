import {
  buildRideInput,
  defaultRideDraft,
  departureIso,
  rideDays,
  shiftDeparture,
  shiftPrice,
} from './rideForm';

const from = '0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d';
const to = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const monday0740 = { isoDate: '2026-10-19', minutes: 7 * 60 + 40 };

describe('defaultRideDraft', () => {
  it('propose un départ dans environ 1 h, au quart d’heure', () => {
    expect(defaultRideDraft(monday0740)).toMatchObject({
      dayOffset: 0,
      departureMinutes: 8 * 60 + 45,
    });
  });

  it('passe au lendemain quand il est tard', () => {
    expect(defaultRideDraft({ isoDate: '2026-10-19', minutes: 23 * 60 + 30 })).toMatchObject({
      dayOffset: 1,
      departureMinutes: 30, // 00:30
    });
  });
});

describe('dates et heures', () => {
  it('donne l’instant exact en heure de Tunis (+01:00)', () => {
    expect(departureIso(monday0740, 1, 7 * 60 + 30)).toBe('2026-10-20T07:30:00+01:00');
  });

  it('propose 7 jours', () => {
    const days = rideDays(monday0740);
    expect(days).toHaveLength(7);
    expect(days[6]).toEqual({ offset: 6, isoDate: '2026-10-25' });
  });

  it('règle l’heure par quart d’heure et le prix par 500 millimes, dans les limites', () => {
    const draft = defaultRideDraft(monday0740);
    expect(shiftDeparture(draft, -1).departureMinutes).toBe(8 * 60 + 30);
    expect(shiftDeparture(draft, -1000).departureMinutes).toBe(0);
    expect(shiftPrice(draft, 1).priceMillimes).toBe(3500);
    expect(shiftPrice(draft, -100).priceMillimes).toBe(0);
  });
});

describe('buildRideInput', () => {
  it('construit la requête quand le départ et l’arrivée sont choisis', () => {
    const input = buildRideInput(
      { ...defaultRideDraft(monday0740), fromLocalityId: from, toLocalityId: to },
      monday0740,
    );
    expect(input).toMatchObject({ fromLocalityId: from, toLocalityId: to, seats: 3 });
  });

  it('renvoie null sans arrivée, ou pour un trajet vers le même endroit', () => {
    const draft = { ...defaultRideDraft(monday0740), fromLocalityId: from };
    expect(buildRideInput(draft, monday0740)).toBeNull();
    expect(buildRideInput({ ...draft, toLocalityId: from }, monday0740)).toBeNull();
  });
});
