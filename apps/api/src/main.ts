// Doit être importé en premier : permet aux décorateurs NestJS de lire les types.
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import type { Env } from './config/env.schema';
import { API_PREFIX, setupApp, setupSwagger } from './setup-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const logger = new Logger('Bootstrap');

  setupApp(app);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupSwagger(app);
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  logger.log(`API démarrée sur http://localhost:${port}/${API_PREFIX}/v1`);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    logger.log(`Documentation Swagger : http://localhost:${port}/${API_PREFIX}/docs`);
  }
}

void bootstrap();
