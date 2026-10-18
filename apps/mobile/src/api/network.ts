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

/** Clés de cache TanStack Query, centralisées pour éviter les fautes de frappe. */
export const queryKeys = {
  lines: ['lines'] as const,
  line: (id: string) => ['line', id] as const,
  nearbyStops: (center: GeoPoint) =>
    // Arrondi à ~100 m : de petits déplacements réutilisent le même résultat.
    ['nearbyStops', center.latitude.toFixed(3), center.longitude.toFixed(3)] as const,
  stopDepartures: (stopId: string) => ['stopDepartures', stopId] as const,
  lineReports: (lineId: string) => ['lineReports', lineId] as const,
  lineStats: (lineId: string) => ['lineStats', lineId] as const,
  myTrust: ['myTrust'] as const,
};
