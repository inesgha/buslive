import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { FcmPushSender } from './fcm-push-sender';
import { LogPushSender } from './log-push-sender';
import { MemoryPushSender } from './memory-push-sender';
import { PUSH_SENDER, type PushSender } from './push-sender';

/** Choisit la version de PushSender selon PUSH_PROVIDER (voir .env.example). */
export const pushSenderProvider: Provider = {
  provide: PUSH_SENDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): PushSender => {
    switch (config.get('PUSH_PROVIDER', { infer: true })) {
      case 'fcm':
        // Présence garantie par la validation de l'environnement (env.schema.ts).
        return new FcmPushSender(
          config.get('GOOGLE_APPLICATION_CREDENTIALS', { infer: true }) ?? '',
        );
      case 'memory':
        return new MemoryPushSender();
      default:
        return new LogPushSender();
    }
  },
};
