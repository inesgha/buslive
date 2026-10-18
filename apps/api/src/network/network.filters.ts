/**
 * Filtres « visible publiquement » : seuls les éléments validés (ACTIVE) d'un
 * gouvernorat activé sont renvoyés. Les propositions en attente (PENDING) et
 * les gouvernorats pas encore ouverts restent invisibles.
 */
export const ACTIVE_GOVERNORATE = { isActive: true } as const;
export const VISIBLE_LINE = { status: 'ACTIVE', governorate: ACTIVE_GOVERNORATE } as const;
export const VISIBLE_STOP = { status: 'ACTIVE', governorate: ACTIVE_GOVERNORATE } as const;
