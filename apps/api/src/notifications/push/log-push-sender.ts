import { Logger } from '@nestjs/common';

import type { PushMessage, PushResult, PushSender } from './push-sender';

/**
 * Développement sans Firebase : la notification est écrite dans la console de
 * l'API au lieu d'être envoyée. Elle apparaît quand même dans l'historique de
 * l'app (onglet Alertes).
 */
export class LogPushSender implements PushSender {
  private readonly logger = new Logger('Push');

  send(tokens: string[], message: PushMessage): Promise<PushResult> {
    const devices =
      tokens.length === 0 ? 'aucun téléphone enregistré' : `${tokens.length} téléphone(s)`;
    this.logger.log(`[${message.channelId}] ${message.title} — ${message.body} (${devices})`);
    return Promise.resolve({ sent: tokens.length, invalidTokens: [] });
  }
}
