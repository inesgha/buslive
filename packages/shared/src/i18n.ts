import { z } from 'zod';

/** Langues de l'interface. Le français est la langue par défaut. */
export const LOCALES = ['fr', 'ar'] as const;
export const LocaleSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;

export const DEFAULT_LOCALE: Locale = 'fr';

/** Langues qui s'écrivent de droite à gauche (mise en page RTL). */
const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['ar']);

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}
