import type { Locale } from '@buslive/shared';

/** L'API renvoie chaque nom en français et en arabe : on garde celui de la langue affichée. */
export function localizedName(entity: { nameFr: string; nameAr: string }, locale: Locale): string {
  return locale === 'ar' ? entity.nameAr : entity.nameFr;
}

export function localizedHeadsign(
  direction: { headsignFr: string; headsignAr: string },
  locale: Locale,
): string {
  return locale === 'ar' ? direction.headsignAr : direction.headsignFr;
}
