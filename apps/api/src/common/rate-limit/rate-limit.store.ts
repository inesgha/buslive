import { Injectable } from '@nestjs/common';

interface Window {
  count: number;
  /** Fin de la fenêtre (timestamp en ms). */
  resetAt: number;
}

export interface HitResult {
  count: number;
  resetAt: number;
}

/** Intervalle minimal entre deux nettoyages des fenêtres expirées (ms). */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Compteurs de requêtes en mémoire, algorithme « fenêtre fixe » :
 * la première requête d'une clé ouvre une fenêtre de durée fixe ; chaque requête
 * suivante incrémente le compteur jusqu'à la fin de la fenêtre.
 *
 * Limite connue : la mémoire est propre à un processus. Avec plusieurs instances
 * de l'API (phase 11), il faudra un stockage partagé (Redis) derrière la même interface.
 */
@Injectable()
export class RateLimitStore {
  private readonly windows = new Map<string, Window>();
  private lastSweep = Date.now();

  /** Enregistre une requête pour « key » et renvoie le compteur de la fenêtre en cours. */
  hit(key: string, windowMs: number): HitResult {
    const now = Date.now();
    this.sweepExpired(now);

    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    return { count: window.count, resetAt: window.resetAt };
  }

  /** Nombre de fenêtres en mémoire (utile aux tests). */
  get size(): number {
    return this.windows.size;
  }

  /** Supprime les fenêtres expirées, au plus une fois par minute, pour borner la mémoire. */
  private sweepExpired(now: number): void {
    if (now - this.lastSweep < SWEEP_INTERVAL_MS) return;
    this.lastSweep = now;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}
