import { apiBaseUrl } from './http';

/**
 * Adresse d'une page publique du serveur (lien de suivi, pages légales) :
 * celle de l'API sans « /api/v1 », suivie du chemin.
 * En développement, c'est l'adresse du PC sur le Wi-Fi : la page ne s'ouvre
 * que sur le même réseau. En production, c'est l'adresse publique.
 */
export function publicUrl(path: string, baseUrl: string = apiBaseUrl()): string {
  return `${baseUrl.replace(/\/api\/v\d+\/?$/, '')}${path}`;
}
