import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { queryKeys } from '@/api/network';
import { useIsOnline } from '@/hooks/useIsOnline';
import { onReports, unwatchLine, watchLine } from '@/live/socket';

/**
 * Tient à jour les signalements affichés : à chaque événement Socket.io
 * « reports » sur une des lignes suivies, les données concernées sont
 * rechargées (liste de la ligne, passages et signalements des arrêts).
 */
export function useReportUpdates(lineIds: readonly string[]): void {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const key = [...new Set(lineIds)].sort().join(',');

  useEffect(() => {
    if (!online || key === '') return;
    const ids = key.split(',');
    const unsubscribe = onReports((event) => {
      if (!ids.includes(event.lineId)) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.lineReports(event.lineId) });
      void queryClient.invalidateQueries({ queryKey: ['stopDepartures'] });
    });
    ids.forEach(watchLine);
    return () => {
      unsubscribe();
      ids.forEach(unwatchLine);
    };
  }, [key, online, queryClient]);
}
