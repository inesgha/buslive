import { z } from 'zod';

import { LocalityOptionSchema } from './louage';
import { TRUST_RULES, TrustLevelSchema } from './trust';

/**
 * Covoiturage entre utilisateurs : un conducteur publie un trajet, un passager
 * demande des places, le conducteur accepte ou refuse. Les numéros de
 * téléphone ne sont échangés qu'APRÈS l'acceptation, et seulement entre ces
 * deux personnes. Pas de texte libre, pas de paiement dans l'app.
 */
export const RIDE_RULES = {
  maxActiveOffersPerDriver: 3,
  maxSeats: 6,
  /** Participation maximale par place : 100 DT (en millimes). */
  maxPriceMillimes: 100_000,
  /** Les prix vont de 100 en 100 millimes. */
  priceStepMillimes: 100,
  /** Publier au plus tôt 10 min avant le départ, au plus tard 7 jours avant. */
  minMinutesBeforeDeparture: 10,
  maxDaysAhead: 7,
  /** Demandes de places au plus par passager et par jour (contre les abus). */
  maxRequestsPerDay: 10,
  /** Sous ce score de confiance, on ne peut ni publier ni demander. */
  minTrustScore: TRUST_RULES.hiddenBelowScore,
} as const;

export const RIDE_OFFER_STATUSES = ['ACTIVE', 'CANCELLED'] as const;
export const RideOfferStatusSchema = z.enum(RIDE_OFFER_STATUSES);
export type RideOfferStatus = z.infer<typeof RideOfferStatusSchema>;

export const RIDE_REQUEST_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED'] as const;
export const RideRequestStatusSchema = z.enum(RIDE_REQUEST_STATUSES);
export type RideRequestStatus = z.infer<typeof RideRequestStatusSchema>;

/** Motifs pour signaler une annonce (traitée par la modération, phase 10). */
export const RIDE_FLAG_REASONS = ['FAKE', 'UNSAFE', 'INAPPROPRIATE'] as const;
export const RideFlagReasonSchema = z.enum(RIDE_FLAG_REASONS);
export type RideFlagReason = z.infer<typeof RideFlagReasonSchema>;

// --- Requêtes -------------------------------------------------------------------

/** Corps de POST /rides. */
export const CreateRideOfferSchema = z
  .object({
    fromLocalityId: z.uuid(),
    toLocalityId: z.uuid(),
    departureAt: z.iso.datetime({ offset: true }),
    seats: z.number().int().min(1).max(RIDE_RULES.maxSeats),
    priceMillimes: z
      .number()
      .int()
      .min(0)
      .max(RIDE_RULES.maxPriceMillimes)
      .multipleOf(RIDE_RULES.priceStepMillimes),
  })
  .refine((offer) => offer.fromLocalityId !== offer.toLocalityId, {
    path: ['toLocalityId'],
    message: 'Le départ et l’arrivée doivent être différents.',
  });
export type CreateRideOfferInput = z.infer<typeof CreateRideOfferSchema>;

/** Corps de POST /rides/:id/requests. */
export const RideRequestInputSchema = z.object({
  seats: z.number().int().min(1).max(RIDE_RULES.maxSeats),
});
export type RideRequestInput = z.infer<typeof RideRequestInputSchema>;

/** Corps de POST /rides/:id/flags. */
export const RideFlagInputSchema = z.object({ reason: RideFlagReasonSchema });
export type RideFlagInput = z.infer<typeof RideFlagInputSchema>;

/** Paramètres de GET /rides (trajets à venir, 7 jours). */
export const RideSearchQuerySchema = z.object({
  from: z.uuid().optional(),
  to: z.uuid().optional(),
});
export type RideSearchQuery = z.infer<typeof RideSearchQuerySchema>;

// --- Réponses ---------------------------------------------------------------------

/** Ce qu'on sait du conducteur ou du passager : JAMAIS son téléphone ici. */
export const RidePersonSchema = z.object({
  displayName: z.string(),
  trustLevel: TrustLevelSchema,
});

export const RideOfferSchema = z.object({
  id: z.uuid(),
  from: LocalityOptionSchema,
  to: LocalityOptionSchema,
  departureAt: z.iso.datetime(),
  seats: z.number().int().positive(),
  seatsLeft: z.number().int().nonnegative(),
  priceMillimes: z.number().int().nonnegative(),
  status: RideOfferStatusSchema,
  driver: RidePersonSchema,
  /** Pour l'utilisateur connecté : est-ce son annonce ? sa demande ? */
  mine: z.boolean(),
  myRequest: z
    .object({
      id: z.uuid(),
      seats: z.number().int().positive(),
      status: RideRequestStatusSchema,
      /** Téléphone du conducteur, seulement si la demande est acceptée. */
      driverPhone: z.string().nullable(),
    })
    .nullable(),
});
export type RideOffer = z.infer<typeof RideOfferSchema>;

/** Une demande, vue par le conducteur. */
export const RideRequestSchema = z.object({
  id: z.uuid(),
  seats: z.number().int().positive(),
  status: RideRequestStatusSchema,
  createdAt: z.iso.datetime(),
  passenger: RidePersonSchema,
  /** Téléphone du passager, seulement après acceptation. */
  passengerPhone: z.string().nullable(),
});
export type RideRequest = z.infer<typeof RideRequestSchema>;

/** Détail d'une annonce : les demandes ne sont renvoyées qu'au conducteur. */
export const RideOfferDetailSchema = RideOfferSchema.extend({
  requests: z.array(RideRequestSchema),
});
export type RideOfferDetail = z.infer<typeof RideOfferDetailSchema>;

/** Réponse de GET /me/rides : mes annonces et les trajets où j'ai demandé une place. */
export const MyRidesSchema = z.object({
  offers: z.array(RideOfferDetailSchema),
  requested: z.array(RideOfferSchema),
});
export type MyRides = z.infer<typeof MyRidesSchema>;

// --- Règles -------------------------------------------------------------------------

/** Places encore libres : places proposées − places acceptées. */
export function seatsLeft(seats: number, acceptedSeats: number): number {
  return Math.max(0, seats - acceptedSeats);
}

/** Une annonce accepte-t-elle encore des demandes ? */
export function isRideOpen(
  offer: { status: RideOfferStatus; departureAt: string | Date },
  now: Date = new Date(),
): boolean {
  return offer.status === 'ACTIVE' && new Date(offer.departureAt).getTime() > now.getTime();
}
