import type { DirectionSummary, LineSummary, LiveSessionEndReason } from '@buslive/shared';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { endLiveSession, sendPositions, startLiveSession } from './api';
import { isBackgroundSharingRunning, LOCATION_TASK, stopBackgroundUpdates } from './backgroundTask';
import { isExpoGo } from './environment';
import { latestSamples, toSample } from './positions';
import {
  clearSharing,
  type LastResult,
  loadLastResult,
  loadSharing,
  saveLastResult,
  saveSharing,
  type SharingState,
} from './sharingStore';

/** Intervalle d'envoi des positions en mode « app ouverte » (ms). */
const FOREGROUND_SEND_INTERVAL_MS = 10_000;
/** Fréquence de lecture du dernier résultat écrit par la tâche d'arrière-plan (ms). */
const RESULT_POLL_MS = 5_000;

type ShareStatus =
  | { kind: 'idle' }
  | {
      kind: 'sharing';
      sharing: SharingState;
      last: LastResult | null;
      foregroundReason?: 'expoGo' | 'permission';
    }
  | { kind: 'ended'; reason: LiveSessionEndReason };

interface ShareContextValue {
  status: ShareStatus;
  start: (line: LineSummary, direction: DirectionSummary) => Promise<void>;
  stop: () => Promise<void>;
  /** Revenir à l'état initial après la fin d'un partage. */
  dismiss: () => void;
}

const ShareContext = createContext<ShareContextValue | null>(null);

export class LocationPermissionError extends Error {}

/**
 * Pilote le partage « Je suis dans le bus » :
 * - mode ARRIÈRE-PLAN (build de développement / app publiée, permission
 *   « Toujours ») : la tâche backgroundTask.ts envoie les positions, même app fermée ;
 * - mode APP OUVERTE (Expo Go, ou permission refusée) : on suit la position ici
 *   et on garde l'écran allumé.
 */
export function ShareProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ShareStatus>({ kind: 'idle' });
  const watcher = useRef<Location.LocationSubscription | null>(null);
  const buffer = useRef<Location.LocationObject[]>([]);
  const sendTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopForegroundTracking = useCallback(() => {
    watcher.current?.remove();
    watcher.current = null;
    if (sendTimer.current) clearInterval(sendTimer.current);
    sendTimer.current = null;
    buffer.current = [];
    deactivateKeepAwake('buslive-share');
  }, []);

  const finish = useCallback(
    async (reason: LiveSessionEndReason) => {
      stopForegroundTracking();
      await stopBackgroundUpdates();
      await clearSharing();
      setStatus({ kind: 'ended', reason });
    },
    [stopForegroundTracking],
  );

  /** Mode app ouverte : envoie les positions accumulées toutes les 10 s. */
  const startForegroundTracking = useCallback(
    async (sharing: SharingState) => {
      await activateKeepAwakeAsync('buslive-share');
      watcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5_000, distanceInterval: 10 },
        (location) => buffer.current.push(location),
      );
      sendTimer.current = setInterval(() => {
        const pending = buffer.current;
        if (pending.length === 0) return;
        buffer.current = [];
        void sendPositions(sharing.sessionId, latestSamples(pending.map(toSample)))
          .then(async (result) => {
            await saveLastResult(result);
            if (result.session.status === 'ENDED') {
              await finish(result.session.endReason ?? 'INACTIVE');
              return;
            }
            setStatus((current) =>
              current.kind === 'sharing'
                ? {
                    ...current,
                    last: {
                      onRoute: result.onRoute,
                      sharersOnVehicle: result.sharersOnVehicle,
                      sentAt: new Date().toISOString(),
                      endReason: null,
                    },
                  }
                : current,
            );
          })
          .catch(() => {
            // Réseau indisponible : on remet les positions dans la file (les plus récentes).
            buffer.current = [...pending, ...buffer.current].slice(-20);
          });
      }, FOREGROUND_SEND_INTERVAL_MS);
    },
    [finish],
  );

  // Au démarrage de l'app : reprendre un partage en arrière-plan encore actif.
  useEffect(() => {
    void (async () => {
      const sharing = await loadSharing();
      if (!sharing) return;
      if (sharing.mode === 'background' && (await isBackgroundSharingRunning())) {
        setStatus({ kind: 'sharing', sharing, last: await loadLastResult() });
      } else {
        // Partage « app ouverte » interrompu par la fermeture de l'app : on le clôt.
        void endLiveSession(sharing.sessionId).catch(() => undefined);
        await clearSharing();
      }
    })();
  }, []);

  // En mode arrière-plan, la tâche écrit son dernier résultat : on le relit régulièrement.
  const isBackgroundSharing = status.kind === 'sharing' && status.sharing.mode === 'background';
  useEffect(() => {
    if (!isBackgroundSharing) return;
    const timer = setInterval(() => {
      void (async () => {
        const last = await loadLastResult();
        if (last?.endReason) {
          await finish(last.endReason);
          return;
        }
        setStatus((current) => (current.kind === 'sharing' ? { ...current, last } : current));
      })();
    }, RESULT_POLL_MS);
    return () => clearInterval(timer);
  }, [isBackgroundSharing, finish]);

  const start = useCallback(
    async (line: LineSummary, direction: DirectionSummary) => {
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (foreground.status !== 'granted') throw new LocationPermissionError();

      // L'arrière-plan demande la permission « Toujours » (et n'existe pas dans Expo Go).
      let foregroundReason: 'expoGo' | 'permission' | undefined;
      if (isExpoGo()) {
        foregroundReason = 'expoGo';
      } else {
        const background = await Location.requestBackgroundPermissionsAsync();
        if (background.status !== 'granted') foregroundReason = 'permission';
      }

      const session = await startLiveSession({ lineId: line.id, directionId: direction.id });
      const sharing: SharingState = {
        sessionId: session.id,
        lineId: line.id,
        directionId: direction.id,
        lineCode: line.code,
        lineColor: line.color,
        headsignFr: direction.headsignFr,
        headsignAr: direction.headsignAr,
        mode: foregroundReason ? 'foreground' : 'background',
      };
      await saveSharing(sharing);

      if (sharing.mode === 'background') {
        await Location.startLocationUpdatesAsync(LOCATION_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: FOREGROUND_SEND_INTERVAL_MS,
          distanceInterval: 20,
          deferredUpdatesInterval: FOREGROUND_SEND_INTERVAL_MS,
          pausesUpdatesAutomatically: false,
          activityType: Location.ActivityType.AutomotiveNavigation,
          showsBackgroundLocationIndicator: true,
          // Notification permanente imposée par Android pendant le partage.
          foregroundService: {
            notificationTitle: t('share.notificationTitle'),
            notificationBody: t('share.notificationBody'),
            notificationColor: line.color,
          },
        });
      } else {
        await startForegroundTracking(sharing);
      }
      setStatus({ kind: 'sharing', sharing, last: null, foregroundReason });
    },
    [startForegroundTracking, t],
  );

  const stop = useCallback(async () => {
    const sharing = status.kind === 'sharing' ? status.sharing : await loadSharing();
    // Arrêt « au mieux » côté serveur : hors ligne, le partage expirera de lui-même.
    if (sharing) void endLiveSession(sharing.sessionId).catch(() => undefined);
    await finish('USER');
  }, [status, finish]);

  const dismiss = useCallback(() => setStatus({ kind: 'idle' }), []);

  // À la destruction du fournisseur : on libère le GPS du mode « app ouverte ».
  useEffect(() => stopForegroundTracking, [stopForegroundTracking]);

  const value = useMemo(() => ({ status, start, stop, dismiss }), [status, start, stop, dismiss]);
  return <ShareContext.Provider value={value}>{children}</ShareContext.Provider>;
}

export function useShare(): ShareContextValue {
  const context = useContext(ShareContext);
  if (!context) throw new Error('useShare doit être utilisé dans <ShareProvider>.');
  return context;
}
