import { groupIntoVehicles, isSpeedPlausible, LIVE_RULES, type SharerState } from './live';

describe('isSpeedPlausible', () => {
  const start = { point: { latitude: 35.4978, longitude: 11.0473 }, at: 0 };

  it('accepte un bus à 50 km/h', () => {
    // ~139 m en 10 s = 50 km/h (0,00125° de latitude ≈ 139 m).
    expect(
      isSpeedPlausible(start, { point: { latitude: 35.49905, longitude: 11.0473 }, at: 10_000 }),
    ).toBe(true);
  });

  it('refuse un saut de 5 km en 10 s (1800 km/h)', () => {
    expect(
      isSpeedPlausible(start, { point: { latitude: 35.5428, longitude: 11.0473 }, at: 10_000 }),
    ).toBe(false);
  });

  it('ignore les petits sauts dus au bruit du GPS', () => {
    expect(
      isSpeedPlausible(start, { point: { latitude: 35.4981, longitude: 11.0473 }, at: 1_000 }),
    ).toBe(true);
  });
});

describe('groupIntoVehicles', () => {
  const sharer = (
    sessionId: string,
    distanceAlongMeters: number,
    directionId = 'aller',
  ): SharerState => ({
    sessionId,
    directionId,
    position: { latitude: 35.49 + distanceAlongMeters / 1e6, longitude: 11.04 },
    distanceAlongMeters,
    progressMinutes: distanceAlongMeters / 300,
    updatedAt: 1000 + distanceAlongMeters,
  });

  it('regroupe deux passagers proches en un seul bus (position moyenne)', () => {
    const [vehicle, ...others] = groupIntoVehicles([sharer('b', 1000), sharer('a', 1080)]);
    expect(others).toHaveLength(0);
    expect(vehicle).toMatchObject({ id: 'vehicle-a', sharers: 2, directionId: 'aller' });
    expect(vehicle?.sessionIds).toEqual(['a', 'b']);
    expect(vehicle?.progressMinutes).toBeCloseTo((1000 + 1080) / 2 / 300);
  });

  it('sépare deux bus éloignés sur le même sens', () => {
    const vehicles = groupIntoVehicles([
      sharer('a', 1000),
      sharer('b', 1000 + LIVE_RULES.sameVehicleMeters + 50),
    ]);
    expect(vehicles.map((v) => v.sharers)).toEqual([1, 1]);
  });

  it('ne mélange jamais deux sens différents', () => {
    const vehicles = groupIntoVehicles([sharer('a', 1000, 'aller'), sharer('b', 1000, 'retour')]);
    expect(vehicles).toHaveLength(2);
  });
});
