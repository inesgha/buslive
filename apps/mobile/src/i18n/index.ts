import { DEFAULT_LOCALE, type Locale } from '@buslive/shared';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { loadLocalePreference, saveLocalePreference } from '@/storage/preferences';

import ar from './locales/ar.json';
import fr from './locales/fr.json';

export const resources = {
  fr: { translation: fr },
  ar: { translation: ar },
} as const;

/** Langue du téléphone : arabe si le téléphone est en arabe, sinon français. */
export function detectDeviceLocale(): Locale {
  return getLocales()[0]?.languageCode === 'ar' ? 'ar' : DEFAULT_LOCALE;
}

/**
 * Initialise i18next avec la langue choisie (Profil) ou, à défaut, celle du
 * téléphone. Renvoie la langue retenue.
 */
export async function initI18n(): Promise<Locale> {
  const locale = (await loadLocalePreference()) ?? detectDeviceLocale();
  await i18n.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    // React échappe déjà le texte affiché.
    interpolation: { escapeValue: false },
  });
  return locale;
}

/** Change la langue et mémorise le choix. */
export async function changeLocale(locale: Locale): Promise<void> {
  await saveLocalePreference(locale);
  await i18n.changeLanguage(locale);
}

export function currentLocale(): Locale {
  return i18n.language === 'ar' ? 'ar' : 'fr';
}

export default i18n;
