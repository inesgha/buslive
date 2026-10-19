import { EventEmitter } from 'node:events';

import type { VehicleGroup } from '@buslive/shared';
import { Injectable } from '@nestjs/common';

/**
 * Un bus en direct vient de dépasser un arrêt. « sessionId » sert seulement aux
 * liens « Partager mon trajet » (arrivée à l'arrêt de descente) : les passages
 * observés, eux, restent anonymes (l'identifiant n'est jamais enregistré avec).
 */
export interface StopPassedEvent {
  sessionId: string;
  lineId: string;
  directionId: string;
  stopId: string;
  observedAt: Date;
}

/** Un passager a mené un partage à bien (récompensé en points de confiance). */
export interface SharingCompletedEvent {
  userId: string;
  sessionId: string;
}

/**
 * Les bus en direct d'une ligne viennent d'être recalculés (au plus une fois par
 * LIVE_BROADCAST_INTERVAL_MS et par ligne, comme la diffusion Socket.io).
 * Usage interne : « sessionIds » ne doit jamais sortir de l'API.
 */
export interface VehiclesUpdatedEvent {
  lineId: string;
  vehicles: VehicleGroup[];
  at: Date;
}

interface LiveEventMap {
  stopPassed: [StopPassedEvent];
  sharingCompleted: [SharingCompletedEvent];
  vehiclesUpdated: [VehiclesUpdatedEvent];
}

/**
 * Événements internes émis par le module temps réel. D'autres modules
 * (signalements, confiance, alertes) s'y abonnent : le module temps réel n'a pas besoin
 * de les connaître, ce qui évite une dépendance circulaire entre modules.
 */
@Injectable()
export class LiveEvents extends EventEmitter<LiveEventMap> {}
