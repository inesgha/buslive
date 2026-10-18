import {
  type Alert,
  type AlertInput,
  AlertSchema,
  type Favorites,
  FavoritesSchema,
  type NotificationList,
  NotificationListSchema,
  type PushPlatform,
  type TestNotificationResult,
  TestNotificationResultSchema,
  type UpdateProfileInput,
  type UserProfile,
  UserProfileSchema,
} from '@buslive/shared';
import { z } from 'zod';

import { apiRequest } from './client';

/** Appels de l'API propres à l'utilisateur connecté : favoris, alertes, notifications. */

// --- Profil ---------------------------------------------------------------------

export function updateProfile(input: UpdateProfileInput): Promise<UserProfile> {
  return apiRequest('/me', { method: 'PATCH', body: input, auth: true, schema: UserProfileSchema });
}

// --- Favoris ------------------------------------------------------------------------

export function fetchFavorites(): Promise<Favorites> {
  return apiRequest('/me/favorites', { auth: true, schema: FavoritesSchema });
}

/** Ajouter (PUT) ou retirer (DELETE) un favori : idempotent, on peut réessayer sans risque. */
export function setFavorite(kind: 'lines' | 'stops', id: string, favorite: boolean) {
  return apiRequest(`/me/favorites/${kind}/${id}`, {
    method: favorite ? 'PUT' : 'DELETE',
    auth: true,
  });
}

// --- Alertes ---------------------------------------------------------------------------

export function fetchAlerts(): Promise<Alert[]> {
  return apiRequest('/me/alerts', { auth: true, schema: z.array(AlertSchema) });
}

export function createAlert(input: AlertInput): Promise<Alert> {
  return apiRequest('/me/alerts', { method: 'POST', body: input, auth: true, schema: AlertSchema });
}

export function updateAlert(id: string, input: AlertInput): Promise<Alert> {
  return apiRequest(`/me/alerts/${id}`, {
    method: 'PUT',
    body: input,
    auth: true,
    schema: AlertSchema,
  });
}

export function deleteAlert(id: string) {
  return apiRequest(`/me/alerts/${id}`, { method: 'DELETE', auth: true });
}

// --- Notifications ------------------------------------------------------------------------

export function fetchNotifications(): Promise<NotificationList> {
  return apiRequest('/me/notifications', { auth: true, schema: NotificationListSchema });
}

/** Sans « ids » : tout est marqué comme lu. */
export function markNotificationsRead(ids?: string[]) {
  return apiRequest('/me/notifications/read', {
    method: 'POST',
    body: ids ? { ids } : {},
    auth: true,
  });
}

export function sendTestNotification(): Promise<TestNotificationResult> {
  return apiRequest('/me/notifications/test', {
    method: 'POST',
    auth: true,
    schema: TestNotificationResultSchema,
  });
}

export function registerPushDevice(token: string, platform: PushPlatform) {
  return apiRequest('/me/push-devices', {
    method: 'POST',
    body: { token, platform },
    auth: true,
  });
}

export function unregisterPushDevice(token: string) {
  return apiRequest('/me/push-devices/unregister', {
    method: 'POST',
    body: { token },
    auth: true,
  });
}
