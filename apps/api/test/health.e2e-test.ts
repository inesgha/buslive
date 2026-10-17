// Test de bout en bout : démarre l'application complète et l'appelle en HTTP.
// Nécessite la base Docker démarrée (pnpm db:up) et apps/api/.env.
import 'reflect-metadata';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

describe('Santé de l’API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health → 200', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'buslive-api' });
  });

  it('GET /api/v1/health/ready → 200 avec la version de PostGIS', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.info.database.status).toBe('up');
    expect(response.body.info.database.postgis).toMatch(/^\d+\.\d+/);
  });

  it('ajoute les en-têtes de sécurité helmet', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('GET /health sans préfixe → 404', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
