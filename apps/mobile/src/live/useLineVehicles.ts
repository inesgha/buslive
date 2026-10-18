import { LIVE_RULES, type LiveVehicle } from '@buslive/shared';
import { useEffect, useMemo, useState } from 'react';

import { useIsOnline } from '@/hooks/useIsOnline';

import { onVehicles, unwatchLine, watchLine } from './socket';

/** Un bus est-il assez récent pour être affiché ? (position de moins de 2 min) */
export function isFresh(vehicle: { updatedAt: string }, now = Date.now()): boolean {
  return now - Date.parse(vehicle.updatedAt) <= LIVE_RULES.staleAfterSeconds * 1000;
}

/**
 * Bus en direct des lignes demandées, mis à jour en temps réel (Socket.io).
 * Hors ligne, renvoie une liste vide : on n'affiche jamais de données périmées
 * comme si elles étaient en direct.
 */
export function useLineVehicles(lineIds: readonly string[]): LiveVehicle[] {
  const online = useIsOnline();
  const [byLine, setByLine] = useState<Record<string, LiveVehicle[]>>({});
  const [now, setNow] = useState(() => Date.now());
  // Clé stable : l'effet ne se relance que si l'ensemble des lignes change.
  const key = [...new Set(lineIds)].sort().join(',');

  useEffect(() => {
    if (!online || key === '') return;
    const ids = key.split(',');
    const unsubscribe = onVehicles((payload) => {
      if (ids.includes(payload.lineId)) {
        setByLine((current) => ({ ...current, [payload.lineId]: payload.vehicles }));
      }
    });
    ids.forEach(watchLine);
    return () => {
      unsubscribe();
      ids.forEach(unwatchLine);
    };
  }, [key, online]);

  // Horloge pour retirer les bus dont la position a vieilli.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  return useMemo(() => {
    if (!online) return [];
    const ids = new Set(key.split(','));
    return Object.entries(byLine)
      .filter(([lineId]) => ids.has(lineId))
      .flatMap(([, vehicles]) => vehicles)
      .filter((vehicle) => isFresh(vehicle, now));
  }, [byLine, key, now, online]);
}
