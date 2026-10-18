import { z } from 'zod';

import { GeoPointSchema } from './geo';

/**
 * Formats des données du réseau (gouvernorats, lignes, arrêts, horaires)
 * renvoyées par l'API. Chaque nom existe en français ET en arabe : l'app
 * affiche celui de la langue de l'interface.
 */

export const LINE_TYPES = ['URBAN', 'SUBURBAN', 'INTERCITY'] as const;
export const LineTypeSchema = z.enum(LINE_TYPES);
export type LineType = z.infer<typeof LineTypeSchema>;

export const DIRECTIONS = ['OUTBOUND', 'INBOUND'] as const;
export const DirectionSchema = z.enum(DIRECTIONS);
export type Direction = z.infer<typeof DirectionSchema>;

/** Code ISO 3166-2 d'un gouvernorat tunisien, ex. « TN-53 ». */
export const GovernorateCodeSchema = z
  .string()
  .regex(/^TN-\d{2}$/, 'Code de gouvernorat invalide.');

const BilingualName = { nameFr: z.string(), nameAr: z.string() };

export const GovernorateSchema = z.object({
  id: z.uuid(),
  code: GovernorateCodeSchema,
  ...BilingualName,
});
export type Governorate = z.infer<typeof GovernorateSchema>;

export const LocalitySchema = z.object({ code: z.string(), ...BilingualName });
export type Locality = z.infer<typeof LocalitySchema>;

export const OperatorSchema = z.object({ code: z.string(), name: z.string() });
export type Operator = z.infer<typeof OperatorSchema>;

export const StopSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  ...BilingualName,
  latitude: z.number(),
  longitude: z.number(),
  locality: LocalitySchema.nullable(),
});
export type StopSummary = z.infer<typeof StopSummarySchema>;

export const DirectionSummarySchema = z.object({
  id: z.uuid(),
  direction: DirectionSchema,
  headsignFr: z.string(),
  headsignAr: z.string(),
});
export type DirectionSummary = z.infer<typeof DirectionSummarySchema>;

export const LineSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  ...BilingualName,
  type: LineTypeSchema,
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  governorateCode: GovernorateCodeSchema,
  operator: OperatorSchema.nullable(),
  directions: z.array(DirectionSummarySchema),
});
export type LineSummary = z.infer<typeof LineSummarySchema>;

/** Calendrier de service : mêmes règles que CalendarRule (voir schedule.ts). */
export const ServiceCalendarSchema = z.object({
  code: z.string(),
  ...BilingualName,
  monday: z.boolean(),
  tuesday: z.boolean(),
  wednesday: z.boolean(),
  thursday: z.boolean(),
  friday: z.boolean(),
  saturday: z.boolean(),
  sunday: z.boolean(),
  startDate: z.iso.date().nullable(),
  endDate: z.iso.date().nullable(),
  priority: z.number().int(),
});
export type ServiceCalendar = z.infer<typeof ServiceCalendarSchema>;

export const DirectionDetailSchema = DirectionSummarySchema.extend({
  /** Tracé du parcours (null si inconnu). */
  shape: z.array(GeoPointSchema).nullable(),
  /** Arrêts dans l'ordre du parcours. */
  stops: z.array(
    z.object({
      sequence: z.number().int().positive(),
      minutesFromStart: z.number().int().nonnegative(),
      stop: StopSummarySchema,
    }),
  ),
  /** Tous les départs du terminus, tous calendriers confondus. */
  departures: z.array(
    z.object({ calendarCode: z.string(), departureMinutes: z.number().int().nonnegative() }),
  ),
});
export type DirectionDetail = z.infer<typeof DirectionDetailSchema>;

/**
 * Détail complet d'une ligne : contient tout ce qu'il faut pour calculer les
 * horaires sans réseau (départs + calendriers + temps de trajet par arrêt).
 */
export const LineDetailSchema = LineSummarySchema.omit({ directions: true }).extend({
  directions: z.array(DirectionDetailSchema),
  calendars: z.array(ServiceCalendarSchema),
});
export type LineDetail = z.infer<typeof LineDetailSchema>;

export const StopDetailSchema = StopSummarySchema.extend({
  governorateCode: GovernorateCodeSchema,
  /** Lignes actives qui desservent l'arrêt, avec le sens concerné. */
  lines: z.array(
    LineSummarySchema.omit({ directions: true, operator: true }).extend({
      directions: z.array(DirectionSummarySchema),
    }),
  ),
});
export type StopDetail = z.infer<typeof StopDetailSchema>;

/** Paramètres de GET /lines. */
export const LinesQuerySchema = z.object({
  governorate: GovernorateCodeSchema.optional(),
});
export type LinesQuery = z.infer<typeof LinesQuerySchema>;

// ---------------------------------------------------------------------------
// Arrêts proches et prochains passages (phase 5)
// ---------------------------------------------------------------------------

/** Paramètres de GET /stops/nearby. Le rayon et le nombre sont plafonnés. */
export const NearbyStopsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  /** Rayon de recherche en mètres. */
  radius: z.coerce.number().int().min(50).max(3000).default(800),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type NearbyStopsQuery = z.infer<typeof NearbyStopsQuerySchema>;

/** Ligne vue depuis un arrêt (de quoi afficher sa pastille). */
export const LineBadgeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});
export type LineBadgeInfo = z.infer<typeof LineBadgeSchema>;

export const NearbyStopSchema = StopSummarySchema.extend({
  /** Distance à vol d'oiseau depuis le point demandé, en mètres. */
  distanceMeters: z.number().nonnegative(),
  lines: z.array(LineBadgeSchema),
});
export type NearbyStop = z.infer<typeof NearbyStopSchema>;

/** Paramètres de GET /stops/:id/departures. */
export const StopDeparturesQuerySchema = z.object({
  /** Instant de référence (ISO 8601). Par défaut : maintenant. Utile aux tests. */
  at: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});
export type StopDeparturesQuery = z.infer<typeof StopDeparturesQuerySchema>;

/**
 * Un passage prévu à un arrêt. L'heure est ABSOLUE (journée de service +
 * minutes) : l'app calcule elle-même « dans 5 min », ce qui reste juste même
 * si la réponse vient du cache hors ligne.
 */
export const StopPassageSchema = z.object({
  line: LineBadgeSchema.extend({ nameFr: z.string(), nameAr: z.string() }),
  direction: DirectionSummarySchema,
  serviceDate: z.iso.date(),
  passingMinutes: z.number().int().nonnegative(),
});
export type StopPassage = z.infer<typeof StopPassageSchema>;

/**
 * Arrivée EN DIRECT d'un bus à un arrêt, calculée depuis sa position partagée
 * par les passagers (phase 6). Séparée des passages théoriques : on ne devine
 * pas à quel horaire correspond le bus observé.
 */
export const LiveArrivalSchema = z.object({
  vehicleId: z.string(),
  line: LineBadgeSchema.extend({ nameFr: z.string(), nameAr: z.string() }),
  direction: DirectionSummarySchema,
  /** Minutes avant l'arrivée à l'arrêt (0 = à l'arrêt). */
  etaMinutes: z.number().int().nonnegative(),
  /** Dernière position reçue (ISO 8601) : au-delà de 2 min, ne plus afficher. */
  updatedAt: z.iso.datetime(),
});
export type LiveArrival = z.infer<typeof LiveArrivalSchema>;

export const StopDeparturesSchema = z.object({
  stopId: z.uuid(),
  /** Instant de calcul (ISO 8601). */
  generatedAt: z.iso.datetime(),
  /** Bus en direct qui approchent de l'arrêt (vide si aucun passager ne partage). */
  liveArrivals: z.array(LiveArrivalSchema),
  /** Passages théoriques (horaires). */
  passages: z.array(StopPassageSchema),
});
export type StopDepartures = z.infer<typeof StopDeparturesSchema>;
