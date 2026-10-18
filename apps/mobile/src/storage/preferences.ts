import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Locale } from '@buslive/shared';

/**
 * Préférences de l'utilisateur, conservées sur le téléphone (AsyncStorage).
 * Rien de secret ici : les jetons de connexion vont dans expo-secure-store.
 */

export type ThemePreference = 'system' | 'light' | 'dark';

const KEYS = {
  locale: 'buslive.locale',
  theme: 'buslive.theme',
} as const;

export async function loadLocalePreference(): Promise<Locale | null> {
  const value = await AsyncStorage.getItem(KEYS.locale);
  return value === 'fr' || value === 'ar' ? value : null;
}

export function saveLocalePreference(locale: Locale): Promise<void> {
  return AsyncStorage.setItem(KEYS.locale, locale);
}

export async function loadThemePreference(): Promise<ThemePreference> {
  const value = await AsyncStorage.getItem(KEYS.theme);
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function saveThemePreference(preference: ThemePreference): Promise<void> {
  return AsyncStorage.setItem(KEYS.theme, preference);
}
