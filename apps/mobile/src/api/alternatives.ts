import {
  type CreateRideOfferInput,
  type GeoPoint,
  type LocalityOption,
  LocalityOptionSchema,
  type MyRides,
  MyRidesSchema,
  type NearbyLouageStation,
  NearbyLouageStationSchema,
  type RideFlagReason,
  type RideOffer,
  type RideOfferDetail,
  RideOfferDetailSchema,
  RideOfferSchema,
  type TripShare,
  type TripShareCreated,
  TripShareCreatedSchema,
  TripShareSchema,
} from '@buslive/shared';
import { z } from 'zod';

import { apiRequest } from './client';

/** Appels de l'API pour les alternatives (louage, covoiturage) et « Partager mon trajet ». */

export function fetchLocalities(): Promise<LocalityOption[]> {
  return apiRequest('/localities', { schema: z.array(LocalityOptionSchema) });
}

/** Stations de louage proches (option : seulement celles qui vont à « toLocalityId »). */
export function fetchNearbyLouage(
  center: GeoPoint,
  toLocalityId?: string,
): Promise<NearbyLouageStation[]> {
  const query = new URLSearchParams({
    lat: center.latitude.toFixed(5),
    lng: center.longitude.toFixed(5),
    ...(toLocalityId && { to: toLocalityId }),
  });
  return apiRequest(`/louage/stations/nearby?${query}`, {
    schema: z.array(NearbyLouageStationSchema),
  });
}

// --- Covoiturage ------------------------------------------------------------------

export function searchRides(from?: string, to?: string): Promise<RideOffer[]> {
  const query = new URLSearchParams({ ...(from && { from }), ...(to && { to }) });
  return apiRequest(`/rides?${query}`, { auth: true, schema: z.array(RideOfferSchema) });
}

export function fetchRide(id: string): Promise<RideOfferDetail> {
  return apiRequest(`/rides/${id}`, { auth: true, schema: RideOfferDetailSchema });
}

export function fetchMyRides(): Promise<MyRides> {
  return apiRequest('/me/rides', { auth: true, schema: MyRidesSchema });
}

export function createRide(input: CreateRideOfferInput): Promise<RideOfferDetail> {
  return apiRequest('/rides', {
    method: 'POST',
    body: input,
    auth: true,
    schema: RideOfferDetailSchema,
  });
}

export function cancelRide(id: string): Promise<RideOfferDetail> {
  return apiRequest(`/rides/${id}/cancel`, {
    method: 'POST',
    auth: true,
    schema: RideOfferDetailSchema,
  });
}

export function requestRide(id: string, seats: number): Promise<RideOfferDetail> {
  return apiRequest(`/rides/${id}/requests`, {
    method: 'POST',
    body: { seats },
    auth: true,
    schema: RideOfferDetailSchema,
  });
}

export function cancelRideRequest(id: string): Promise<RideOfferDetail> {
  return apiRequest(`/rides/${id}/requests/mine`, {
    method: 'DELETE',
    auth: true,
    schema: RideOfferDetailSchema,
  });
}

export function respondRideRequest(
  id: string,
  requestId: string,
  accept: boolean,
): Promise<RideOfferDetail> {
  return apiRequest(`/rides/${id}/requests/${requestId}/${accept ? 'accept' : 'decline'}`, {
    method: 'POST',
    auth: true,
    schema: RideOfferDetailSchema,
  });
}

export function flagRide(id: string, reason: RideFlagReason) {
  return apiRequest(`/rides/${id}/flags`, { method: 'POST', body: { reason }, auth: true });
}

// --- Partager mon trajet ---------------------------------------------------------------

export function createTripShare(
  sessionId: string,
  destinationStopId: string,
): Promise<TripShareCreated> {
  return apiRequest('/trips', {
    method: 'POST',
    body: { sessionId, destinationStopId },
    auth: true,
    schema: TripShareCreatedSchema,
  });
}

export function fetchMyTripShares(): Promise<TripShare[]> {
  return apiRequest('/me/trips', { auth: true, schema: z.array(TripShareSchema) });
}

export function revokeTripShare(id: string) {
  return apiRequest(`/trips/${id}`, { method: 'DELETE', auth: true });
}
