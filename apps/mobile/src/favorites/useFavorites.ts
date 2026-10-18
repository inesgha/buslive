import type { Favorites } from '@buslive/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { fetchFavorites, setFavorite } from '@/api/me';
import { queryKeys } from '@/api/network';
import { useAuth } from '@/auth/AuthProvider';

import { applyFavoriteToggle, type FavoriteToggle } from './favorites';

/**
 * Favoris de l'utilisateur connecté (lignes et arrêts), gardés hors ligne.
 * Sans compte : liste vide, et « toggle » n'est pas proposé (voir FavoriteButton).
 */
export function useFavorites() {
  const queryClient = useQueryClient();
  const { state } = useAuth();
  const signedIn = state.status === 'signedIn';
  const query = useQuery({
    queryKey: queryKeys.favorites,
    queryFn: fetchFavorites,
    enabled: signedIn,
  });
  const favorites = signedIn ? query.data : undefined;

  const ids = useMemo(
    () => ({
      lines: new Set(favorites?.lines.map((line) => line.id)),
      stops: new Set(favorites?.stops.map((stop) => stop.id)),
    }),
    [favorites],
  );

  const mutation = useMutation({
    mutationFn: (toggle: FavoriteToggle) => setFavorite(toggle.kind, toggle.id, toggle.favorite),
    onMutate: async (toggle) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.favorites });
      const previous = queryClient.getQueryData<Favorites>(queryKeys.favorites);
      queryClient.setQueryData(queryKeys.favorites, applyFavoriteToggle(previous, toggle));
      return { previous };
    },
    // Échec (hors ligne, limite atteinte…) : on remet l'étoile comme avant.
    onError: (_error, _toggle, context) =>
      queryClient.setQueryData(queryKeys.favorites, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.favorites }),
  });

  return {
    signedIn,
    favorites,
    isFavorite: (kind: FavoriteToggle['kind'], id: string) => ids[kind].has(id),
    toggle: (toggle: FavoriteToggle) => mutation.mutate(toggle),
  };
}
