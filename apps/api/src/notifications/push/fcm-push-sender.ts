import { existsSync } from 'node:fs';
import path from 'node:path';

import { Logger } from '@nestjs/common';
import type { Messaging } from 'firebase-admin/messaging';

import type { PushMessage, PushResult, PushSender } from './push-sender';

/** Erreurs FCM qui signifient « ce jeton ne servira plus » : on le supprime. */
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** FCM accepte au plus 500 jetons par envoi groupé. */
const MAX_TOKENS_PER_CALL = 500;

/**
 * Envoi réel par Firebase Cloud Messaging (Android). Sur iPhone, le jeton
 * obtenu par l'app est un jeton Apple (APNs) que FCM ne sait pas utiliser
 * directement : il faudra une version APNs le jour où l'app sortira sur iOS.
 */
export class FcmPushSender implements PushSender {
  private readonly logger = new Logger('Push');
  private readonly credentialsPath: string;
  private messaging: Promise<Messaging> | null = null;

  constructor(credentialsPath: string) {
    this.credentialsPath = path.resolve(credentialsPath);
    // Échouer au démarrage plutôt qu'au premier envoi, avec un message clair.
    if (!existsSync(this.credentialsPath)) {
      throw new Error(
        `Clé Firebase introuvable : ${this.credentialsPath} (GOOGLE_APPLICATION_CREDENTIALS).`,
      );
    }
  }

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    if (tokens.length === 0) return { sent: 0, invalidTokens: [] };
    const messaging = await this.getMessaging();
    let sent = 0;
    const invalidTokens: string[] = [];

    for (let start = 0; start < tokens.length; start += MAX_TOKENS_PER_CALL) {
      const chunk = tokens.slice(start, start + MAX_TOKENS_PER_CALL);
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title: message.title, body: message.body },
        data: message.data,
        // Priorité haute : « le bus arrive dans 5 min » ne doit pas attendre
        // que le téléphone sorte de veille.
        android: { priority: 'high', notification: { channelId: message.channelId } },
      });
      response.responses.forEach((result, index) => {
        const token = chunk[index];
        if (result.success) sent++;
        else if (token && result.error && INVALID_TOKEN_CODES.has(result.error.code)) {
          invalidTokens.push(token);
        } else {
          this.logger.warn(`Envoi FCM refusé : ${result.error?.code ?? 'raison inconnue'}`);
        }
      });
    }
    return { sent, invalidTokens };
  }

  /**
   * firebase-admin est chargé au premier envoi seulement : le mode « log » et
   * les tests ne le chargent jamais (démarrage plus rapide, aucune clé requise).
   */
  private getMessaging(): Promise<Messaging> {
    this.messaging ??= (async () => {
      const { cert, getApps, initializeApp } = await import('firebase-admin/app');
      const { getMessaging } = await import('firebase-admin/messaging');
      const app = getApps()[0] ?? initializeApp({ credential: cert(this.credentialsPath) });
      return getMessaging(app);
    })();
    return this.messaging;
  }
}
