import AsyncStorage from '@react-native-async-storage/async-storage';
import { type UserProfile, UserProfileSchema } from '@buslive/shared';
import * as SecureStore from 'expo-secure-store';

/**
 * Le refresh token est un SECRET (il permet d'obtenir de nouveaux accès pendant
 * 30 jours) : il est stocké dans expo-secure-store (Keychain iOS / Keystore
 * Android), jamais dans AsyncStorage.
 * L'access token, lui, ne vit qu'en mémoire (il expire au bout de 15 min).
 */
const REFRESH_TOKEN_KEY = 'buslive.refreshToken';

/** Profil mis en cache (non secret) pour afficher le compte même hors ligne. */
const PROFILE_KEY = 'buslive.profile';

export function loadRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export function saveRefreshToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export function deleteRefreshToken(): Promise<void> {
  return SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function loadCachedProfile(): Promise<UserProfile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  const parsed = UserProfileSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export function saveCachedProfile(profile: UserProfile): Promise<void> {
  return AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function deleteCachedProfile(): Promise<void> {
  return AsyncStorage.removeItem(PROFILE_KEY);
}
