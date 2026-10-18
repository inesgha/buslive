import { EventEmitter } from 'node:events';

import { Injectable } from '@nestjs/common';

/** Un signalement vient d'être confirmé ou démenti (après validation de la transaction). */
export interface ReportResolvedEvent {
  reportId: string;
  status: 'CONFIRMED' | 'REJECTED';
  resolvedAt: Date;
}

interface ReportEventMap {
  reportResolved: [ReportResolvedEvent];
}

/**
 * Événements internes du module des signalements. Le module des notifications
 * s'y abonne : les signalements n'ont pas à connaître les notifications.
 */
@Injectable()
export class ReportEvents extends EventEmitter<ReportEventMap> {}
