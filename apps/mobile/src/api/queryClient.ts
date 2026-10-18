import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { type Query, QueryClient } from '@tanstack/react-query';

/** Durée pendant laquelle les données restent utilisables sans réseau. */
export const OFFLINE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Cache des données de l'API (TanStack Query) : chargement, rechargement,
 * nouvelle tentative en cas d'échec. Les données du réseau changent rarement.
 * gcTime ≥ durée hors ligne, sinon le cache serait vidé avant d'être sauvegardé.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: OFFLINE_MAX_AGE_MS,
      retry: 1,
    },
  },
});

/** Sauvegarde du cache sur le téléphone (AsyncStorage) pour l'utiliser hors ligne. */
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'buslive.queryCache',
});

/** Données utiles hors ligne : réseau, lignes, arrêts proches, prochains passages. */
const PERSISTED_KEYS = new Set(['lines', 'line', 'nearbyStops', 'stopDepartures']);

/** Ne sauvegarde que les requêtes réussies des types ci-dessus (rien de personnel). */
export function shouldPersistQuery(query: Pick<Query, 'queryKey' | 'state'>): boolean {
  const [kind] = query.queryKey;
  return typeof kind === 'string' && PERSISTED_KEYS.has(kind) && query.state.status === 'success';
}
