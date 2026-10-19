import {
  type RideOffer as RideOfferDto,
  type RideOfferDetail,
  type RideRequest as RideRequestDto,
  seatsLeft,
  trustLevel,
} from '@buslive/shared';

import type { Prisma } from '../generated/prisma/client';
import { toLocalityOption } from '../network/network.mapper';

const person = { select: { id: true, displayName: true, trustScore: true, phone: true } } as const;

/** Tout ce qu'il faut pour afficher une annonce (y compris ses demandes). */
export const rideInclude = {
  from: { include: { governorate: true } },
  to: { include: { governorate: true } },
  driver: person,
  requests: { include: { passenger: person }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.RideOfferInclude;

export type RideWithRelations = Prisma.RideOfferGetPayload<{ include: typeof rideInclude }>;

/**
 * Annonce vue par « viewerId ». Règle de confidentialité, appliquée ICI et
 * nulle part ailleurs :
 * - le téléphone du conducteur n'est donné qu'au passager dont la demande est
 *   ACCEPTÉE (et tant que l'annonce n'est pas annulée) ;
 * - le téléphone d'un passager n'est donné qu'au conducteur, et seulement
 *   après acceptation ;
 * - la liste des demandes n'est donnée qu'au conducteur.
 */
export function toRideDetail(offer: RideWithRelations, viewerId: string): RideOfferDetail {
  const mine = offer.driverId === viewerId;
  const active = offer.status === 'ACTIVE';
  const accepted = offer.requests
    .filter((request) => request.status === 'ACCEPTED')
    .reduce((sum, request) => sum + request.seats, 0);
  const own = offer.requests.find((request) => request.passengerId === viewerId);

  return {
    id: offer.id,
    from: toLocalityOption(offer.from),
    to: toLocalityOption(offer.to),
    departureAt: offer.departureAt.toISOString(),
    seats: offer.seats,
    seatsLeft: seatsLeft(offer.seats, accepted),
    priceMillimes: offer.priceMillimes,
    status: offer.status,
    driver: {
      displayName: offer.driver.displayName,
      trustLevel: trustLevel(offer.driver.trustScore),
    },
    mine,
    myRequest: own
      ? {
          id: own.id,
          seats: own.seats,
          status: own.status,
          driverPhone: own.status === 'ACCEPTED' && active ? offer.driver.phone : null,
        }
      : null,
    requests: mine
      ? offer.requests.map((request): RideRequestDto => ({
          id: request.id,
          seats: request.seats,
          status: request.status,
          createdAt: request.createdAt.toISOString(),
          passenger: {
            displayName: request.passenger.displayName,
            trustLevel: trustLevel(request.passenger.trustScore),
          },
          passengerPhone: request.status === 'ACCEPTED' && active ? request.passenger.phone : null,
        }))
      : [],
  };
}

/** Annonce dans une liste (sans les demandes). */
export function toRideOffer(offer: RideWithRelations, viewerId: string): RideOfferDto {
  const { requests: _requests, ...summary } = toRideDetail(offer, viewerId);
  return summary;
}
