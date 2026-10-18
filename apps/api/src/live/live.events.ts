import { EventEmitter } from 'node:events';

import { Injectable } from '@nestjs/common';

/** Un bus en direct vient de dépasser un arrêt (passage observé, anonyme). */
export interface StopPassedEvent {
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

interface LiveEventMap {
  stopPassed: [StopPassedEvent];
  sharingCompleted: [SharingCompletedEvent];
}

/**
 * Événements internes émis par le module temps réel. D'autres modules
 * (signalements, confiance) s'y abonnent : le module temps réel n'a pas besoin
 * de les connaître, ce qui évite une dépendance circulaire entre modules.
 */
@Injectable()
export class LiveEvents extends EventEmitter<LiveEventMap> {}
