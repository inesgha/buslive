import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { sendPositions } from './api';
import { latestSamples, toSample } from './positions';
import { clearSharing, loadSharing, saveLastResult } from './sharingStore';

/**
 * Tâche de localisation en ARRIÈRE-PLAN (build de développement ou app publiée).
 * Android la réveille avec des lots de positions, même app fermée ; une
 * notification permanente signale le partage (obligation d'Android).
 *
 * Ce fichier doit être importé au démarrage de l'app (app/_layout.tsx) : la
 * tâche doit être définie AVANT qu'Android ne la réveille.
 */
export const LOCATION_TASK = 'buslive-share-location';

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const sharing = await loadSharing();
    if (!sharing) {
      // Plus de partage enregistré : on arrête la localisation.
      await stopBackgroundUpdates();
      return;
    }
    try {
      const result = await sendPositions(
        sharing.sessionId,
        latestSamples(data.locations.map(toSample)),
      );
      await saveLastResult(result);
      if (result.session.status === 'ENDED') {
        // Arrivé au terminus, partage expiré… : on libère le GPS.
        await stopBackgroundUpdates();
        await clearSharing();
      }
    } catch {
      // Réseau indisponible : les prochaines positions partiront au prochain réveil.
    }
  },
);

export async function stopBackgroundUpdates(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch {
    // Arrière-plan indisponible (ex. Expo Go) : rien à arrêter.
  }
}

export async function isBackgroundSharingRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}
