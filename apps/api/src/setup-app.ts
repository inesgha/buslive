import { type INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import type { Env } from './config/env.schema';

/** Préfixe commun à toutes les routes : /api/v1/... */
export const API_PREFIX = 'api';

/**
 * Configuration HTTP commune à l'application réelle (main.ts) et aux tests e2e,
 * pour que les tests vérifient exactement ce qui tourne en production.
 */
export function setupApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // En-têtes HTTP de sécurité (anti-clickjacking, anti-sniffing MIME…).
  app.use(helmet());

  // Seules les origines listées dans CORS_ORIGINS peuvent appeler l'API depuis
  // un navigateur. L'app mobile native n'est pas concernée par CORS.
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) });

  // Routes versionnées : /api/v1/health. Une future v2 pourra cohabiter avec
  // la v1 pour ne pas casser les anciennes versions de l'app mobile.
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Ferme proprement (connexions à la base…) sur Ctrl+C ou arrêt du conteneur.
  app.enableShutdownHooks();
}

/** Documentation interactive Swagger sur /api/docs (hors production). */
export function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('BusLive API')
      .setDescription('API de BusLive : transport en commun en temps réel en Tunisie.')
      .setVersion('1')
      .build(),
  );
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document);
}
