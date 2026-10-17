import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marque une route (ou un contrôleur entier) comme accessible sans connexion.
 * Par défaut, TOUTES les routes exigent un access token (JwtAuthGuard global) :
 * une route oubliée est donc protégée plutôt qu'ouverte par erreur.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
