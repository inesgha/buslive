import { z } from 'zod';

/**
 * Point GPS en degrés décimaux (WGS 84, le système utilisé par les téléphones
 * et par PostGIS avec le SRID 4326).
 */
export const GeoPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type GeoPoint = z.infer<typeof GeoPointSchema>;

/**
 * Rectangle englobant approximatif de la Tunisie. Sert à rejeter les positions
 * manifestement fausses (GPS aberrant, position simulée…).
 */
export const TUNISIA_BOUNDS = {
  minLatitude: 30.2,
  maxLatitude: 37.6,
  minLongitude: 7.5,
  maxLongitude: 11.7,
} as const;

/** Indique si un point se trouve dans le rectangle englobant de la Tunisie. */
export function isInTunisia(point: GeoPoint): boolean {
  return (
    point.latitude >= TUNISIA_BOUNDS.minLatitude &&
    point.latitude <= TUNISIA_BOUNDS.maxLatitude &&
    point.longitude >= TUNISIA_BOUNDS.minLongitude &&
    point.longitude <= TUNISIA_BOUNDS.maxLongitude
  );
}

/** Point GPS valide ET situé en Tunisie. */
export const TunisianGeoPointSchema = GeoPointSchema.refine(isInTunisia, {
  message: 'La position doit se trouver en Tunisie.',
});
