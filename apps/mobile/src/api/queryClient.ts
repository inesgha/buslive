import { QueryClient } from '@tanstack/react-query';

/**
 * Cache des données de l'API (TanStack Query) : chargement, rechargement,
 * nouvelle tentative en cas d'échec. Les données du réseau changent rarement.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});
