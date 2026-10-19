import { type INestApplication, RequestMethod, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { ConfiguredIoAdapter } from './common/io-adapter';
import { requestLogger } from './common/logging/request-logger';
import type { Env } from './config/env.schema';

/**
 * Taille maximale d'un corps de requête JSON. Les plus gros envois (lot de 20
 * positions, station de louage) font quelques kilo-octets : au-delà, c'est un
 * abus (413).
 */
export const BODY_LIMIT = '100kb';

/** Préfixe commun à toutes les routes : /api/v1/... */
export const API_PREFIX = 'api';

/**
 * Configuration HTTP commune à l'application réelle (main.ts) et aux tests e2e,
 * pour que les tests vérifient exactement ce qui tourne en production.
 */
export function setupApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  const express = app as NestExpressApplication;
  // Derrière un proxy (Caddy) : l'adresse IP du client est lue dans X-Forwarded-For.
  express.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  express.useBodyParser('json', { limit: BODY_LIMIT });

  // En-têtes HTTP de sécurité (anti-clickjacking, anti-sniffing MIME, HSTS…).
  app.use(helmet());
  if (config.get('LOG_REQUESTS', { infer: true })) app.use(requestLogger());

  // Seules les origines listées dans CORS_ORIGINS peuvent appeler l'API depuis
  // un navigateur. L'app mobile native n'est pas concernée par CORS.
  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });
  // credentials : le tableau de bord web envoie son cookie de session, mais
  // SEULEMENT aux origines listées (jamais « * »).
  app.enableCors({ origin: corsOrigins, credentials: true });
  // Socket.io (bus en direct, espace « /live ») : mêmes origines autorisées.
  app.useWebSocketAdapter(new ConfiguredIoAdapter(app, corsOrigins));

  // Routes versionnées : /api/v1/health. Une future v2 pourra cohabiter avec
  // la v1 pour ne pas casser les anciennes versions de l'app mobile.
  // Exceptions : la page de suivi « Partager mon trajet » (/t/<jeton>, lien court)
  // et les pages légales (/legal/…, adresses données à Google Play).
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 't/assets/trip.js', method: RequestMethod.GET },
      { path: 't/:token', method: RequestMethod.GET },
      { path: 'legal/privacy', method: RequestMethod.GET },
      { path: 'legal/account-deletion', method: RequestMethod.GET },
    ],
  });
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
      // Bouton « Authorize » : coller l'accessToken pour tester les routes protégées.
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document);
}
