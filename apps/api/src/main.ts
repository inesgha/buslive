// Doit être importé en premier : permet aux décorateurs NestJS de lire les types.
import 'reflect-metadata';

import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { JsonLogger } from './common/logging/json-logger';
import { type Env, productionWarnings, type ProductionSettings } from './config/env.schema';
import { API_PREFIX, setupApp, setupSwagger } from './setup-app';

async function bootstrap(): Promise<void> {
  // Journaux mis en attente jusqu'au choix du format (texte ou JSON, voir LOG_FORMAT).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.useLogger(
    config.get('LOG_FORMAT', { infer: true }) === 'json' ? new JsonLogger() : new ConsoleLogger(),
  );
  const logger = new Logger('Bootstrap');
  for (const warning of productionWarnings(productionSettings(config))) {
    logger.warn(warning);
  }

  setupApp(app);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupSwagger(app);
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  // Une requête bloquée ne garde pas une connexion ouverte indéfiniment.
  const server = app.getHttpServer();
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  logger.log(`API démarrée sur http://localhost:${port}/${API_PREFIX}/v1`);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    logger.log(`Documentation Swagger : http://localhost:${port}/${API_PREFIX}/docs`);
  }
}

/** Les réglages vérifiés au démarrage en production. */
function productionSettings(config: ConfigService<Env, true>): ProductionSettings {
  return {
    NODE_ENV: config.get('NODE_ENV', { infer: true }),
    PUSH_PROVIDER: config.get('PUSH_PROVIDER', { infer: true }),
    TRUST_PROXY: config.get('TRUST_PROXY', { infer: true }),
    LOG_FORMAT: config.get('LOG_FORMAT', { infer: true }),
    CONTACT_EMAIL: config.get('CONTACT_EMAIL', { infer: true }),
  };
}

void bootstrap();
