import type { FavoriteStop, Favorites, LineDetail, LineSummary, NearbyStop } from '@buslive/shared';

/** Ajout ou retrait d'un favori (l'objet sert à l'afficher tout de suite, avant la réponse). */
export type FavoriteToggle =
  | { kind: 'lines'; id: string; favorite: boolean; line?: LineSummary }
  | { kind: 'stops'; id: string; favorite: boolean; stop?: FavoriteStop };

/**
 * Mise à jour « optimiste » de la liste en cache : l'étoile change
 * immédiatement, la requête part ensuite (annulée en cas d'erreur).
 */
export function applyFavoriteToggle(
  favorites: Favorites | undefined,
  toggle: FavoriteToggle,
): Favorites | undefined {
  if (!favorites) return favorites;
  if (toggle.kind === 'lines') {
    const lines = favorites.lines.filter((line) => line.id !== toggle.id);
    return {
      ...favorites,
      lines: toggle.favorite && toggle.line ? [...lines, toggle.line] : lines,
    };
  }
  const stops = favorites.stops.filter((stop) => stop.id !== toggle.id);
  return {
    ...favorites,
    stops: toggle.favorite && toggle.stop ? [...stops, toggle.stop] : stops,
  };
}

/** Détail d'une ligne → résumé (format des favoris). */
export function lineSummaryOf(line: LineDetail): LineSummary {
  return {
    id: line.id,
    code: line.code,
    nameFr: line.nameFr,
    nameAr: line.nameAr,
    type: line.type,
    color: line.color,
    governorateCode: line.governorateCode,
    operator: line.operator,
    directions: line.directions.map(({ id, direction, headsignFr, headsignAr }) => ({
      id,
      direction,
      headsignFr,
      headsignAr,
    })),
  };
}

/** Arrêt de la carte → arrêt favori (sans la distance, propre à la recherche). */
export function favoriteStopOf(stop: NearbyStop): FavoriteStop {
  const { distanceMeters: _distance, ...favorite } = stop;
  return favorite;
}
