// Test de bout en bout : démarre l'application complète et l'appelle en HTTP.
// Nécessite la base Docker démarrée (pnpm db:up) et apps/api/.env.
import request from 'supertest';

import { createTestApp, type TestApp } from './utils';

describe('Santé de l’API (e2e)', () => {
  let testApp: TestApp;
  const http = () => request(testApp.app.getHttpServer());

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('GET /api/v1/health → 200 sans authentification', async () => {
    const response = await http().get('/api/v1/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'buslive-api' });
  });

  it('GET /api/v1/health/ready → 200 avec la version de PostGIS', async () => {
    const response = await http().get('/api/v1/health/ready').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.info.database.status).toBe('up');
    expect(response.body.info.database.postgis).toMatch(/^\d+\.\d+/);
  });

  it('ajoute les en-têtes de sécurité helmet', async () => {
    const response = await http().get('/api/v1/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('GET /health sans préfixe → 404', async () => {
    await http().get('/health').expect(404);
  });
});
