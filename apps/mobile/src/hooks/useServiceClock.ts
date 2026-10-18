import { type ServiceClock, tunisClock } from '@buslive/shared';
import { useEffect, useState } from 'react';

/**
 * Heure de Tunis, rafraîchie régulièrement : les « dans 5 min » se mettent à
 * jour tout seuls, même sans nouvelle requête (et donc hors ligne).
 */
export function useServiceClock(refreshMs = 30_000): ServiceClock {
  const [clock, setClock] = useState<ServiceClock>(() => tunisClock());
  useEffect(() => {
    const timer = setInterval(() => setClock(tunisClock()), refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs]);
  return clock;
}
