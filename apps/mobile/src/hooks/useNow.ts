import { useEffect, useState } from 'react';

/**
 * Instant présent (ms), rafraîchi régulièrement. À utiliser au lieu d'appeler
 * Date.now() pendant l'affichage : React exige un rendu « pur » (le même
 * résultat à chaque fois), et l'écran se met quand même à jour avec le temps.
 */
export function useNow(refreshMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs]);
  return now;
}
