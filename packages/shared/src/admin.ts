import { z } from 'zod';

import { LocalityOptionSchema, LouageRouteSchema } from './louage';
import { GovernorateCodeSchema, GovernorateSchema, LineBadgeSchema } from './network';
import { REPORT_STATUSES, REPORT_TYPES, ReportSchema, ReportStatusSchema } from './reports';
import { RideFlagReasonSchema, RideOfferStatusSchema } from './rides';
import { TRUST_RULES } from './trust';
import { RoleSchema, UserProfileSchema } from './user';

/**
 * Tableau de bord admin (apps/admin) : modération et gestion du réseau.
 * Toutes les routes /admin/… exigent le rôle MODERATOR au moins ; celles qui
 * touchent aux rôles ou au réseau exigent ADMIN.
 */

// --- Session web (cookie httpOnly) ---------------------------------------------------

/**
 * Réponse de /auth/web/login et /auth/web/refresh : le refresh token n'est PAS
 * dans le corps, il est posé dans un cookie httpOnly (illisible par le JavaScript).
 */
export const WebAuthResponseSchema = z.object({
  user: UserProfileSchema,
  accessToken: z.string(),
  accessTokenExpiresIn: z.number().int().positive(),
});
export type WebAuthResponse = z.infer<typeof WebAuthResponseSchema>;

// --- Journal de modération -----------------------------------------------------------

export const MODERATION_ACTION_TYPES = [
  'REPORT_CONFIRMED',
  'REPORT_REJECTED',
  'REPORT_HIDDEN',
  'STOP_MOVE_APPLIED',
  'STOP_MOVE_DISMISSED',
  'STOP_APPROVED',
  'STOP_REJECTED',
  'STOP_UPDATED',
  'RIDE_CANCELLED',
  'RIDE_FLAGS_DISMISSED',
  'USER_SUSPENDED',
  'USER_REINSTATED',
  'USER_ROLE_CHANGED',
  'GOVERNORATE_UPDATED',
  'LOUAGE_STATION_SAVED',
  'LOUAGE_STATION_ARCHIVED',
] as const;
export const ModerationActionTypeSchema = z.enum(MODERATION_ACTION_TYPES);
export type ModerationActionType = z.infer<typeof ModerationActionTypeSchema>;

export const ModerationActionSchema = z.object({
  id: z.uuid(),
  type: ModerationActionTypeSchema,
  moderator: z.object({ id: z.uuid(), displayName: z.string() }),
  /** Ce sur quoi porte l'action : « report », « stop », « user »… */
  targetType: z.string(),
  targetId: z.string(),
  /** Valeurs avant / après, pour comprendre (et défaire à la main) une action. */
  details: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export type ModerationAction = z.infer<typeof ModerationActionSchema>;

export const ModerationLogQuerySchema = z.object({
  type: ModerationActionTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ModerationLogQuery = z.infer<typeof ModerationLogQuerySchema>;

// --- Tableau de bord ------------------------------------------------------------------

export const AdminDashboardSchema = z.object({
  users: z.object({
    total: z.number().int(),
    newLast7Days: z.number().int(),
    suspended: z.number().int(),
  }),
  live: z.object({ activeSessions: z.number().int() }),
  reports: z.object({
    last24h: z.number().int(),
    last7Days: z.number().int(),
    /** Signalements des 7 derniers jours, par statut. */
    byStatus: z.record(ReportStatusSchema, z.number().int()),
  }),
  topReportedLines: z.array(
    LineBadgeSchema.extend({ nameFr: z.string(), reports: z.number().int() }),
  ),
  rides: z.object({ upcoming: z.number().int(), requestsLast7Days: z.number().int() }),
  notifications: z.object({ last24h: z.number().int() }),
  /** Ce qui attend une décision humaine. */
  queues: z.object({
    contestedReports: z.number().int(),
    stopMoves: z.number().int(),
    stopProposals: z.number().int(),
    rideFlags: z.number().int(),
  }),
});
export type AdminDashboard = z.infer<typeof AdminDashboardSchema>;

// --- Signalements -------------------------------------------------------------------------

const PersonSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  trustScore: z.number().int(),
});

/** Signalement vu par un modérateur : avec son auteur et les poids des votes. */
export const AdminReportSchema = ReportSchema.extend({
  hidden: z.boolean(),
  /** null : l'auteur a supprimé son compte. */
  author: PersonSchema.nullable(),
  confirmWeight: z.number(),
  denyWeight: z.number(),
  proposedLatitude: z.number().nullable(),
  proposedLongitude: z.number().nullable(),
  moderatedAt: z.iso.datetime().nullable(),
});
export type AdminReport = z.infer<typeof AdminReportSchema>;

export const AdminReportsQuerySchema = z.object({
  status: z.enum(REPORT_STATUSES).optional(),
  type: z.enum(REPORT_TYPES).optional(),
  lineId: z.uuid().optional(),
  /** Seulement les signalements contestés (des « pour » ET des « contre ») ou cachés. */
  contested: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AdminReportsQuery = z.infer<typeof AdminReportsQuerySchema>;

/**
 * Décision d'un modérateur : CONFIRM / REJECT tranchent le signalement (points
 * versés comme pour un vote, une seule fois) ; HIDE le retire de l'affichage.
 */
export const ModerateReportSchema = z.object({ decision: z.enum(['CONFIRM', 'REJECT', 'HIDE']) });
export type ModerateReportInput = z.infer<typeof ModerateReportSchema>;

// --- Arrêts : déplacements et propositions -------------------------------------------------

const StopPositionSchema = z.object({
  id: z.uuid(),
  nameFr: z.string(),
  nameAr: z.string(),
  latitude: z.number(),
  longitude: z.number(),
});

/** « Arrêt déplacé » confirmé par les passagers, en attente d'une décision. */
export const StopMoveSchema = z.object({
  reportId: z.uuid(),
  stop: StopPositionSchema,
  proposed: z.object({ latitude: z.number(), longitude: z.number() }),
  distanceMeters: z.number().nonnegative(),
  confirmations: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type StopMove = z.infer<typeof StopMoveSchema>;

export const StopMoveDecisionSchema = z.object({ apply: z.boolean() });
export type StopMoveDecisionInput = z.infer<typeof StopMoveDecisionSchema>;

export const STOP_PROPOSAL_RULES = {
  maxPerDay: 5,
  /** Refus si un arrêt (actif ou proposé) existe déjà à moins de 30 m. */
  minDistanceMeters: 30,
  /** Précision GPS minimale exigée pour proposer un arrêt (m). */
  maxAccuracyMeters: 50,
  minTrustScore: TRUST_RULES.hiddenBelowScore,
  maxLines: 10,
} as const;

const StopNameSchema = z.string().trim().min(2).max(80);

/** Corps de POST /stops/proposals (app mobile). */
export const StopProposalInputSchema = z.object({
  nameFr: StopNameSchema,
  /** Facultatif : un modérateur pourra le compléter. */
  nameAr: StopNameSchema.optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().max(STOP_PROPOSAL_RULES.maxAccuracyMeters),
  /** Lignes qui passent, selon le passager (indication pour les modérateurs). */
  lineIds: z.array(z.uuid()).max(STOP_PROPOSAL_RULES.maxLines).default([]),
});
export type StopProposalInput = z.input<typeof StopProposalInputSchema>;

export const STOP_PROPOSAL_STATUSES = ['PENDING', 'ACTIVE', 'REJECTED'] as const;

/** Une proposition, vue par son auteur. */
export const StopProposalSchema = z.object({
  id: z.uuid(),
  nameFr: z.string(),
  nameAr: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  status: z.enum(STOP_PROPOSAL_STATUSES),
  lines: z.array(LineBadgeSchema),
  createdAt: z.iso.datetime(),
});
export type StopProposal = z.infer<typeof StopProposalSchema>;

/** Une proposition, vue par un modérateur. */
export const AdminStopProposalSchema = StopProposalSchema.extend({
  governorateCode: GovernorateCodeSchema,
  proposedBy: PersonSchema.nullable(),
  /** Arrêt existant le plus proche (doublon possible). */
  nearestStop: z
    .object({ id: z.uuid(), nameFr: z.string(), distanceMeters: z.number().nonnegative() })
    .nullable(),
});
export type AdminStopProposal = z.infer<typeof AdminStopProposalSchema>;

/** Approuver (en corrigeant au besoin le nom ou la position) ou refuser. */
export const ReviewStopProposalSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  nameFr: StopNameSchema.optional(),
  nameAr: StopNameSchema.optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type ReviewStopProposalInput = z.infer<typeof ReviewStopProposalSchema>;

// --- Covoiturage signalé ----------------------------------------------------------------------

export const AdminRideFlagSchema = z.object({
  offerId: z.uuid(),
  from: LocalityOptionSchema,
  to: LocalityOptionSchema,
  departureAt: z.iso.datetime(),
  status: RideOfferStatusSchema,
  driver: PersonSchema,
  flags: z.array(z.object({ reason: RideFlagReasonSchema, count: z.number().int() })),
  total: z.number().int(),
  lastFlaggedAt: z.iso.datetime(),
});
export type AdminRideFlag = z.infer<typeof AdminRideFlagSchema>;

export const ResolveRideFlagsSchema = z.object({ action: z.enum(['CANCEL', 'DISMISS']) });
export type ResolveRideFlagsInput = z.infer<typeof ResolveRideFlagsSchema>;

// --- Comptes ----------------------------------------------------------------------------------

export const AdminUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  role: RoleSchema,
  trustScore: z.number().int(),
  /** Le numéro lui-même n'est pas montré aux modérateurs (inutile, et donnée personnelle). */
  hasPhone: z.boolean(),
  suspendedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  reports: z.number().int(),
  rideOffers: z.number().int(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const AdminUsersQuerySchema = z.object({
  /** Recherche dans l'email et le nom affiché. */
  q: z.string().trim().max(100).optional(),
  role: RoleSchema.optional(),
  suspended: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AdminUsersQuery = z.infer<typeof AdminUsersQuerySchema>;

export const SuspendUserSchema = z.object({ suspended: z.boolean() });
export type SuspendUserInput = z.infer<typeof SuspendUserSchema>;

export const ChangeRoleSchema = z.object({ role: RoleSchema });
export type ChangeRoleInput = z.infer<typeof ChangeRoleSchema>;

// --- Réseau (ADMIN) ---------------------------------------------------------------------------

export const AdminGovernorateSchema = GovernorateSchema.extend({
  isActive: z.boolean(),
  lines: z.number().int(),
  stops: z.number().int(),
});
export type AdminGovernorate = z.infer<typeof AdminGovernorateSchema>;

export const UpdateGovernorateSchema = z.object({ isActive: z.boolean() });
export type UpdateGovernorateInput = z.infer<typeof UpdateGovernorateSchema>;

export const AdminStopSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  nameFr: z.string(),
  nameAr: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'ARCHIVED']),
  governorateCode: GovernorateCodeSchema,
  lines: z.array(LineBadgeSchema),
});
export type AdminStop = z.infer<typeof AdminStopSchema>;

export const AdminStopsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  governorate: GovernorateCodeSchema.optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'ARCHIVED']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type AdminStopsQuery = z.infer<typeof AdminStopsQuerySchema>;

export const UpdateStopSchema = z
  .object({
    nameFr: StopNameSchema.optional(),
    nameAr: StopNameSchema.optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  })
  .refine((input) => (input.latitude === undefined) === (input.longitude === undefined), {
    path: ['longitude'],
    message: 'La latitude et la longitude vont ensemble.',
  });
export type UpdateStopInput = z.infer<typeof UpdateStopSchema>;

/** Station de louage vue par un administrateur. */
export const AdminLouageStationSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  nameFr: z.string(),
  nameAr: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  locality: LocalityOptionSchema.nullable(),
  governorateCode: GovernorateCodeSchema,
  openingMinutes: z.number().int().nullable(),
  closingMinutes: z.number().int().nullable(),
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'ARCHIVED']),
  routes: z.array(LouageRouteSchema),
});
export type AdminLouageStation = z.infer<typeof AdminLouageStationSchema>;

/** Création ou remplacement complet d'une station (ses destinations comprises). */
export const UpsertLouageStationSchema = z
  .object({
    code: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Code en minuscules et tirets, ex. « sousse-louage ».'),
    nameFr: StopNameSchema,
    nameAr: StopNameSchema,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    /** Localité de la station : elle donne aussi son gouvernorat. */
    localityId: z.uuid(),
    openingMinutes: z.number().int().min(0).max(1440).nullable(),
    closingMinutes: z.number().int().min(0).max(1440).nullable(),
    routes: z
      .array(
        z.object({
          destinationLocalityId: z.uuid(),
          priceMillimes: z.number().int().min(0).max(200_000),
          durationMinutes: z
            .number()
            .int()
            .min(1)
            .max(24 * 60),
        }),
      )
      .max(50)
      .refine(
        (routes) => new Set(routes.map((r) => r.destinationLocalityId)).size === routes.length,
        'Destination en double.',
      ),
  })
  .refine(
    (station) =>
      (station.openingMinutes === null) === (station.closingMinutes === null) &&
      (station.openingMinutes === null ||
        station.closingMinutes === null ||
        station.openingMinutes < station.closingMinutes),
    { path: ['closingMinutes'], message: 'Horaires incohérents.' },
  );
export type UpsertLouageStationInput = z.infer<typeof UpsertLouageStationSchema>;
