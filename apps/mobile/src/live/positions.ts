import { LIVE_RULES, type PositionSample } from '@buslive/shared';
import type { LocationObject } from 'expo-location';

/** Position du téléphone → format attendu par l'API. */
export function toSample(location: LocationObject): PositionSample {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    // Certains appareils ne donnent pas la précision : on suppose la pire acceptée.
    accuracy: location.coords.accuracy ?? LIVE_RULES.maxAccuracyMeters,
    recordedAt: new Date(location.timestamp).toISOString(),
  };
}

/**
 * Garde au plus maxBatchSize positions, les plus récentes : après une longue
 * coupure réseau, inutile d'envoyer un trajet complet (l'API ignore de toute
 * façon les positions de plus de 10 minutes).
 */
export function latestSamples(samples: PositionSample[]): PositionSample[] {
  return [...samples]
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))
    .slice(-LIVE_RULES.maxBatchSize);
}
