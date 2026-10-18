import type { PushMessage, PushResult, PushSender } from './push-sender';

/** Tests automatiques : garde les messages en mémoire pour les vérifier. */
export class MemoryPushSender implements PushSender {
  readonly sent: { tokens: string[]; message: PushMessage }[] = [];
  /** Jetons à traiter comme refusés par FCM (simule une app désinstallée). */
  readonly invalid = new Set<string>();

  send(tokens: string[], message: PushMessage): Promise<PushResult> {
    this.sent.push({ tokens, message });
    const invalidTokens = tokens.filter((token) => this.invalid.has(token));
    return Promise.resolve({ sent: tokens.length - invalidTokens.length, invalidTokens });
  }

  clear(): void {
    this.sent.length = 0;
    this.invalid.clear();
  }
}
