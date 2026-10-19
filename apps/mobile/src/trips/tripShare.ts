import { publicUrl } from '@/api/publicUrl';

/** Adresse complète d'une page de suivi (chemin « /t/<jeton> » renvoyé par l'API). */
export function tripShareUrl(path: string, baseUrl?: string): string {
  return publicUrl(path, baseUrl);
}
