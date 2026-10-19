import { z } from 'zod';

import type { ServiceClock } from './clock';
import { GovernorateCodeSchema, LocalitySchema } from './network';

/**
 * Louages : taxis collectifs qui partent d'une station quand ils sont pleins,
 * vers une destination fixe, à un prix réglementé. Ce sont des données de
 * référence (pas de temps réel), gardées hors ligne par l'app.
 */

/** Localité utilisable dans un choix (départ, destination). */
export const LocalityOptionSchema = LocalitySchema.extend({
  id: z.uuid(),
  governorateCode: GovernorateCodeSchema,
});
export type LocalityOption = z.infer<typeof LocalityOptionSchema>;

export const LouageRouteSchema = z.object({
  id: z.uuid(),
  destination: LocalityOptionSchema,
  /** Prix habituel d'une place, en millimes (voir formatMillimes). */
  priceMillimes: z.number().int().nonnegative(),
  /** Durée approximative du trajet. */
  durationMinutes: z.number().int().positive(),
});
export type LouageRoute = z.infer<typeof LouageRouteSchema>;

export const LouageStationSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  nameFr: z.string(),
  nameAr: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  locality: LocalityOptionSchema.nullable(),
  /** Horaires d'ouverture (minutes depuis minuit, heure de Tunis) ; null = inconnus. */
  openingMinutes: z.number().int().min(0).max(1440).nullable(),
  closingMinutes: z.number().int().min(0).max(1440).nullable(),
  routes: z.array(LouageRouteSchema),
});
export type LouageStation = z.infer<typeof LouageStationSchema>;

export const NearbyLouageStationSchema = LouageStationSchema.extend({
  distanceMeters: z.number().nonnegative(),
});
export type NearbyLouageStation = z.infer<typeof NearbyLouageStationSchema>;

/** Paramètres de GET /louage/stations/nearby. */
export const NearbyLouageQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  /** Rayon en mètres : une station de louage peut être loin de l'arrêt de bus. */
  radius: z.coerce.number().int().min(500).max(30000).default(10000),
  /** Seulement les stations qui desservent cette localité. */
  to: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});
export type NearbyLouageQuery = z.infer<typeof NearbyLouageQuerySchema>;

/** La station est-elle ouverte à cette heure ? null si ses horaires sont inconnus. */
export function isStationOpen(
  station: Pick<LouageStation, 'openingMinutes' | 'closingMinutes'>,
  clock: ServiceClock,
): boolean | null {
  if (station.openingMinutes === null || station.closingMinutes === null) return null;
  return clock.minutes >= station.openingMinutes && clock.minutes < station.closingMinutes;
}
