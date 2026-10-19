import {
  type GeoPoint,
  type LineDetail,
  LineDetailSchema,
  type LineSummary,
  LineSummarySchema,
  type NearbyStop,
  NearbyStopSchema,
  type StopDepartures,
  StopDeparturesSchema,
  type StopDetail,
  StopDetailSchema,
} from '@buslive/shared';
import { z } from 'zod';

import { apiRequest } from './client';

/** Lignes actives (tous les gouvernorats ouverts). */
export function fetchLines(): Promise<LineSummary[]> {
  return apiRequest('/lines', { schema: z.array(LineSummarySchema) });
}

/** Détail complet d'une ligne (de quoi calculer ses horaires hors ligne). */
export function fetchLine(id: string): Promise<LineDetail> {
  return apiRequest(`/lines/${id}`, { schema: LineDetailSchema });
}

/** Arrêts autour d'un point, du plus proche au plus loin. */
export function fetchNearbyStops(center: GeoPoint, radiusMeters = 1500): Promise<NearbyStop[]> {
  const query = new URLSearchParams({
    lat: center.latitude.toFixed(5),
    lng: center.longitude.toFixed(5),
    radius: String(radiusMeters),
  });
  return apiRequest(`/stops/nearby?${query}`, { schema: z.array(NearbyStopSchema) });
}

/** Prochains passages à un arrêt (heures absolues : restent valables hors ligne). */
export function fetchStopDepartures(stopId: string): Promise<StopDepartures> {
  return apiRequest(`/stops/${stopId}/departures`, { schema: StopDeparturesSchema });
}

/** Détail d'un arrêt : les lignes et les sens qui le desservent (formulaire d'alerte). */
export function fetchStop(stopId: string): Promise<StopDetail> {
  return apiRequest(`/stops/${stopId}`, { schema: StopDetailSchema });
}

/** Clés de cache TanStack Query, centralisées pour éviter les fautes de frappe. */
export const queryKeys = {
  lines: ['lines'] as const,
  line: (id: string) => ['line', id] as const,
  nearbyStops: (center: GeoPoint) =>
    // Arrondi à ~100 m : de petits déplacements réutilisent le même résultat.
    ['nearbyStops', center.latitude.toFixed(3), center.longitude.toFixed(3)] as const,
  stop: (stopId: string) => ['stop', stopId] as const,
  stopDepartures: (stopId: string) => ['stopDepartures', stopId] as const,
  lineReports: (lineId: string) => ['lineReports', lineId] as const,
  lineStats: (lineId: string) => ['lineStats', lineId] as const,
  myTrust: ['myTrust'] as const,
  // Données personnelles (phase 8) : effacées à la déconnexion (clearPersonalQueries).
  favorites: ['favorites'] as const,
  alerts: ['alerts'] as const,
  notifications: ['notifications'] as const,
  // Alternatives (phase 9). Louages et localités : gardés hors ligne.
  localities: ['localities'] as const,
  louageNearby: (center: GeoPoint, toLocalityId?: string) =>
    [
      'louageNearby',
      center.latitude.toFixed(2),
      center.longitude.toFixed(2),
      toLocalityId ?? '',
    ] as const,
  // Covoiturage et liens de suivi : données du compte (PERSONAL_KEYS), jamais gardées.
  rides: (from?: string, to?: string) => ['rides', from ?? '', to ?? ''] as const,
  ride: (id: string) => ['ride', id] as const,
  myRides: ['myRides'] as const,
  tripShares: ['tripShares'] as const,
  // Arrêts proposés (phase 10) : données du compte.
  myStopProposals: ['myStopProposals'] as const,
};
