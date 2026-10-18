import type { LocationObject } from 'expo-location';

import { latestSamples, toSample } from './positions';
import { socketOrigin } from './socket';
import { isFresh } from './useLineVehicles';

const location = (timestamp: number, accuracy: number | null = 8): LocationObject => ({
  timestamp,
  coords: {
    latitude: 35.4978,
    longitude: 11.0473,
    accuracy,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
});

describe('toSample', () => {
  it('convertit une position du téléphone au format de l’API', () => {
    expect(toSample(location(Date.UTC(2026, 9, 19, 7, 0)))).toEqual({
      latitude: 35.4978,
      longitude: 11.0473,
      accuracy: 8,
      recordedAt: '2026-10-19T07:00:00.000Z',
    });
  });

  it('suppose la pire précision acceptée si le téléphone ne la donne pas', () => {
    expect(toSample(location(0, null)).accuracy).toBe(100);
  });
});

describe('latestSamples', () => {
  it('garde les 20 positions les plus récentes, dans l’ordre chronologique', () => {
    const samples = Array.from({ length: 30 }, (_, i) => toSample(location(30_000 - i * 1000)));
    const kept = latestSamples(samples);
    expect(kept).toHaveLength(20);
    expect(kept[0]?.recordedAt).toBe(new Date(11_000).toISOString());
    expect(kept.at(-1)?.recordedAt).toBe(new Date(30_000).toISOString());
  });
});

describe('socketOrigin', () => {
  it('retire le chemin de l’API pour garder l’origine du serveur', () => {
    expect(socketOrigin('http://10.35.111.93:3000/api/v1')).toBe('http://10.35.111.93:3000');
    expect(socketOrigin('https://api.buslive.tn/api/v1')).toBe('https://api.buslive.tn');
  });

  it('refuse une adresse invalide', () => {
    expect(() => socketOrigin('pas-une-url')).toThrow();
  });
});

describe('isFresh', () => {
  const now = Date.UTC(2026, 9, 19, 7, 0);
  it('considère une position de moins de 2 min comme récente', () => {
    expect(isFresh({ updatedAt: new Date(now - 90_000).toISOString() }, now)).toBe(true);
    expect(isFresh({ updatedAt: new Date(now - 150_000).toISOString() }, now)).toBe(false);
  });
});
