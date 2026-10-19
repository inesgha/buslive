import { apiBaseUrl } from '@/api/http';

/**
 * Adresse complète d'une page de suivi : celle du serveur (sans « /api/v1 »)
 * suivie du chemin renvoyé par l'API (« /t/<jeton> »).
 * En développement, c'est l'adresse du PC sur le Wi-Fi : le lien ne s'ouvre que
 * sur le même réseau. En production, ce sera l'adresse publique (phase 11).
 */
export function tripShareUrl(path: string, baseUrl: string = apiBaseUrl()): string {
  return `${baseUrl.replace(/\/api\/v\d+\/?$/, '')}${path}`;
}
