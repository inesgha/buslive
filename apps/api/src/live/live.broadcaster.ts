import { LIVE_EVENTS, type LineReportEvent } from '@buslive/shared';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Namespace } from 'socket.io';

import type { Env } from '../config/env.schema';
import { LiveRegistry } from './live.registry';

/** Nom de la « room » Socket.io des spectateurs d'une ligne. */
export function lineRoom(lineId: string): string {
  return `line:${lineId}`;
}

/**
 * Diffuse les bus en direct aux spectateurs d'une ligne, au plus une fois par
 * intervalle (LIVE_BROADCAST_INTERVAL_MS) : si 10 positions arrivent en 1 s,
 * un seul message part, avec l'état le plus récent.
 */
@Injectable()
export class LiveBroadcaster implements OnModuleDestroy {
  private server: Namespace | null = null;
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private readonly intervalMs: number;

  constructor(
    private readonly registry: LiveRegistry,
    config: ConfigService<Env, true>,
  ) {
    this.intervalMs = config.get('LIVE_BROADCAST_INTERVAL_MS', { infer: true });
  }

  /** Appelé par la passerelle Socket.io une fois le serveur prêt. */
  attach(server: Namespace): void {
    this.server = server;
  }

  /** Programme une diffusion pour cette ligne (regroupe les demandes rapprochées). */
  schedule(lineId: string): void {
    if (this.pending.has(lineId)) return;
    const timer = setTimeout(() => {
      this.pending.delete(lineId);
      this.server
        ?.to(lineRoom(lineId))
        .emit(LIVE_EVENTS.vehicles, this.registry.lineVehicles(lineId, Date.now()));
    }, this.intervalMs);
    // Ne retient pas le processus à l'arrêt.
    timer.unref();
    this.pending.set(lineId, timer);
  }

  /** Diffuse immédiatement un signalement (nouveau ou mis à jour) aux spectateurs de la ligne. */
  emitReport(event: LineReportEvent): void {
    this.server?.to(lineRoom(event.lineId)).emit(LIVE_EVENTS.reports, event);
  }

  onModuleDestroy(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
  }
}
