import type { GeoPoint } from '@buslive/shared';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export type UserLocation =
  | { status: 'pending' }
  | { status: 'denied' }
  | {
      status: 'granted';
      position: GeoPoint | null;
      /** Précision horizontale annoncée par le GPS (m), si connue. */
      accuracy: number | null;
    };

function toGranted(location: Location.LocationObject | null): UserLocation {
  return {
    status: 'granted',
    position: location
      ? { latitude: location.coords.latitude, longitude: location.coords.longitude }
      : null,
    accuracy: location?.coords.accuracy ?? null,
  };
}

/**
 * Position de l'utilisateur, avec la permission « pendant l'utilisation »
 * seulement. La position reste sur le téléphone : elle n'est envoyée à l'API
 * que pour chercher les arrêts proches, et n'y est pas enregistrée.
 */
export function useUserLocation(): UserLocation {
  const [state, setState] = useState<UserLocation>({ status: 'pending' });

  useEffect(() => {
    let cancelled = false;
    const update = (next: UserLocation) => {
      if (!cancelled) setState(next);
    };

    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return update({ status: 'denied' });

      // Dernière position connue (immédiate), puis position actuelle (plus précise).
      const last = await Location.getLastKnownPositionAsync();
      update(toGranted(last));
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      update(toGranted(current));
    })().catch(() => update({ status: 'denied' }));

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
