import { distanceMeters, GeoPointSchema, isInTunisia, TunisianGeoPointSchema } from './geo';

describe('GeoPointSchema', () => {
  it('accepte un point valide', () => {
    expect(GeoPointSchema.safeParse({ latitude: 35.5047, longitude: 11.0622 }).success).toBe(true);
  });

  it('refuse une latitude hors limites', () => {
    expect(GeoPointSchema.safeParse({ latitude: 95, longitude: 11 }).success).toBe(false);
  });

  it('refuse une valeur qui n’est pas un nombre', () => {
    expect(GeoPointSchema.safeParse({ latitude: '35.5', longitude: 11 }).success).toBe(false);
  });
});

describe('isInTunisia / TunisianGeoPointSchema', () => {
  // Coordonnées approximatives des villes de lancement.
  const mahdia = { latitude: 35.5047, longitude: 11.0622 };
  const ksourEssef = { latitude: 35.4181, longitude: 10.9947 };
  const paris = { latitude: 48.8566, longitude: 2.3522 };

  it('reconnaît Mahdia et Ksour Essef comme étant en Tunisie', () => {
    expect(isInTunisia(mahdia)).toBe(true);
    expect(isInTunisia(ksourEssef)).toBe(true);
  });

  it('rejette une position hors de Tunisie', () => {
    expect(isInTunisia(paris)).toBe(false);
    expect(TunisianGeoPointSchema.safeParse(paris).success).toBe(false);
  });
});

describe('distanceMeters', () => {
  it('donne 0 pour un même point', () => {
    expect(
      distanceMeters({ latitude: 35.5, longitude: 11 }, { latitude: 35.5, longitude: 11 }),
    ).toBe(0);
  });

  it('calcule ≈ 11,4 km entre Mahdia et Ksour Essef (comme PostGIS)', () => {
    const km =
      distanceMeters(
        { latitude: 35.5047, longitude: 11.0622 },
        { latitude: 35.4181, longitude: 10.9947 },
      ) / 1000;
    expect(km).toBeGreaterThan(11.2);
    expect(km).toBeLessThan(11.6);
  });
});
