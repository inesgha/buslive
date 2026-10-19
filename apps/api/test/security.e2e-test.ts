// Sécurité et vie privée : contrôle d'accès de TOUTES les routes, limites,
// en-têtes, suppression de compte, durées de conservation, pages légales.
import type { LocalityOption } from '@buslive/shared';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';

import { seed } from '../prisma/seed/seed';
import { RetentionService } from '../src/privacy/retention.service';
import { createTestApp, registerUser, resetDatabase, type TestApp } from './utils';

const PASSWORD = 'un-mot-de-passe-solide';
const UUID = '7b0f2c4e-8f43-4d8a-9e0b-3c1a2b4d5e6f';
const TOKEN = 'A'.repeat(32);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Routes PUBLIQUES voulues (« MÉTHODE chemin »). Toute autre route doit
 * refuser une requête sans jeton (401). Ajouter une route publique = l'ajouter
 * ici, en connaissance de cause.
 */
const PUBLIC_ROUTES = new Set([
  'GET /api/v1/health',
  'GET /api/v1/health/ready',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/web/login',
  'POST /api/v1/auth/web/refresh',
  'GET /api/v1/governorates',
  'GET /api/v1/localities',
  'GET /api/v1/lines',
  'GET /api/v1/lines/{id}',
  'GET /api/v1/lines/{id}/reports',
  'GET /api/v1/lines/{id}/stats',
  'GET /api/v1/stops/nearby',
  'GET /api/v1/stops/{id}',
  'GET /api/v1/stops/{id}/departures',
  'GET /api/v1/live/lines/{id}/vehicles',
  'GET /api/v1/louage/stations/nearby',
  'GET /api/v1/trips/{token}',
]);

describe('Sécurité et vie privée (e2e)', () => {
  let testApp: TestApp;
  const http = () => request(testApp.app.getHttpServer());

  beforeAll(async () => {
    testApp = await createTestApp();
    await resetDatabase(testApp.prisma);
    await seed(testApp.prisma, { demo: true });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('contrôle d’accès', () => {
    it('chaque route est soit publique par choix, soit protégée (401 sans jeton)', async () => {
      const document = SwaggerModule.createDocument(testApp.app, new DocumentBuilder().build());
      const routes = Object.entries(document.paths).flatMap(([path, operations]) =>
        Object.keys(operations)
          .filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
          .map((method) => ({ method, path })),
      );
      expect(routes.length).toBeGreaterThan(60);

      const unexpected: string[] = [];
      for (const { method, path } of routes) {
        const key = `${method.toUpperCase()} ${path}`;
        const url = path
          .replace('{token}', TOKEN)
          .replace(/\{code\}/g, 'TN-53')
          .replace(/\{[^}]+\}/g, UUID);
        const response = await (http() as unknown as Record<string, (url: string) => request.Test>)[
          method
        ]!(url).set('Origin', 'http://localhost:5173');
        const isPublic = PUBLIC_ROUTES.has(key);
        // 401 posé par le garde d'authentification (et non par la route elle-même,
        // comme /auth/web/refresh sans cookie).
        const blockedByGuard =
          response.status === 401 && response.body?.message === 'Authentification requise.';
        if (isPublic && blockedByGuard) unexpected.push(`${key} : bloquée alors que publique`);
        if (!isPublic && !blockedByGuard) {
          unexpected.push(`${key} : ${response.status} sans jeton (non protégée ?)`);
        }
      }
      expect(unexpected).toEqual([]);
    });
  });

  describe('protections HTTP', () => {
    it('refuse un corps trop gros (413)', async () => {
      await http()
        .post('/api/v1/auth/login')
        .send({ email: 'x@example.tn', password: 'p'.repeat(200 * 1024) })
        .expect(413);
    });

    it('envoie les en-têtes de sécurité', async () => {
      const response = await http().get('/api/v1/health').expect(200);
      expect(response.headers['strict-transport-security']).toContain('max-age=');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('suppression de compte', () => {
    it('anonymise les signalements, annule les covoiturages, puis le compte n’existe plus', async () => {
      const tokenA = await registerUser(testApp, 'parti@example.tn');
      const tokenB = await registerUser(testApp, 'passager@example.tn');
      const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
      for (const [token, phone] of [
        [tokenA, '22 444 555'],
        [tokenB, '22 666 777'],
      ] as const) {
        await http().patch('/api/v1/me').set(auth(token)).send({ phone }).expect(200);
      }

      const line = await testApp.prisma.line.findFirstOrThrow({
        where: { code: '10' },
        include: { directions: true },
      });
      const report = await http()
        .post('/api/v1/reports')
        .set(auth(tokenA))
        .send({ type: 'FULL', lineId: line.id, directionId: line.directions[0]!.id })
        .expect(201);
      const localities = (await http().get('/api/v1/localities').expect(200))
        .body as LocalityOption[];
      const offer = await http()
        .post('/api/v1/rides')
        .set(auth(tokenA))
        .send({
          fromLocalityId: localities.find((l) => l.code === 'mahdia')!.id,
          toLocalityId: localities.find((l) => l.code === 'sousse')!.id,
          departureAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
          seats: 2,
          priceMillimes: 3000,
        })
        .expect(201);
      await http()
        .post(`/api/v1/rides/${offer.body.id}/requests`)
        .set(auth(tokenB))
        .send({ seats: 1 })
        .expect(201);

      await http().delete('/api/v1/me').set(auth(tokenA)).send({ password: 'faux' }).expect(403);
      await http().delete('/api/v1/me').set(auth(tokenA)).send({ password: PASSWORD }).expect(204);

      expect(
        await testApp.prisma.user.findUnique({ where: { email: 'parti@example.tn' } }),
      ).toBeNull();
      const kept = await testApp.prisma.report.findUniqueOrThrow({ where: { id: report.body.id } });
      expect(kept.userId).toBeNull();
      // Le trajet a été annulé AVANT la suppression : le passager a été prévenu.
      const passenger = await testApp.prisma.user.findUniqueOrThrow({
        where: { email: 'passager@example.tn' },
      });
      expect(
        await testApp.prisma.notification.count({
          where: { userId: passenger.id, type: 'RIDE_CANCELLED' },
        }),
      ).toBe(1);
      await http()
        .post('/api/v1/auth/login')
        .send({ email: 'parti@example.tn', password: PASSWORD })
        .expect(401);
      // Le signalement reste lisible, sans auteur.
      const list = await http().get(`/api/v1/lines/${line.id}/reports`).expect(200);
      expect(list.body.map((r: { id: string }) => r.id)).toContain(report.body.id);
    });

    it('refuse de supprimer un compte de modération (journal complet)', async () => {
      await registerUser(testApp, 'modo@example.tn');
      await testApp.prisma.user.update({
        where: { email: 'modo@example.tn' },
        data: { role: 'MODERATOR' },
      });
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'modo@example.tn', password: PASSWORD })
        .expect(200);
      await http()
        .delete('/api/v1/me')
        .set('Authorization', `Bearer ${login.body.tokens.accessToken}`)
        .send({ password: PASSWORD })
        .expect(409);
    });
  });

  describe('durées de conservation', () => {
    it('efface les vieilles positions, sessions, signalements et passages', async () => {
      const user = await testApp.prisma.user.findUniqueOrThrow({
        where: { email: 'passager@example.tn' },
      });
      const line = await testApp.prisma.line.findFirstOrThrow({
        where: { code: '10' },
        include: { directions: { include: { stops: true } } },
      });
      const direction = line.directions[0]!;
      const now = new Date();
      const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);

      const recentEnded = await testApp.prisma.liveSession.create({
        data: {
          userId: user.id,
          lineId: line.id,
          directionId: direction.id,
          status: 'ENDED',
          endReason: 'USER',
          startedAt: ago(10),
          endedAt: ago(10),
          lastLatitude: 35.5,
          lastLongitude: 11.05,
        },
      });
      const oldSession = await testApp.prisma.liveSession.create({
        data: {
          userId: user.id,
          lineId: line.id,
          directionId: direction.id,
          status: 'ENDED',
          startedAt: ago(100),
          endedAt: ago(100),
        },
      });
      const oldReport = await testApp.prisma.report.create({
        data: {
          userId: user.id,
          type: 'FULL',
          lineId: line.id,
          directionId: direction.id,
          confirmWeight: 1,
          expiresAt: ago(399),
          status: 'EXPIRED',
          createdAt: ago(400),
        },
      });
      await testApp.prisma.stopPassageObservation.create({
        data: {
          lineId: line.id,
          directionId: direction.id,
          stopId: direction.stops[0]!.stopId,
          observedAt: ago(500),
        },
      });

      const report = await testApp.app.get(RetentionService).purge(now);
      expect(report.livePositionsCleared).toBeGreaterThanOrEqual(1);
      expect(report.observations).toBe(1);

      const cleared = await testApp.prisma.liveSession.findUniqueOrThrow({
        where: { id: recentEnded.id },
      });
      expect(cleared).toMatchObject({ lastLatitude: null, lastLongitude: null });
      expect(
        await testApp.prisma.liveSession.findUnique({ where: { id: oldSession.id } }),
      ).toBeNull();
      expect(await testApp.prisma.report.findUnique({ where: { id: oldReport.id } })).toBeNull();
    });
  });

  describe('pages légales', () => {
    it('politique de confidentialité en français et en arabe, avec les vraies durées', async () => {
      const fr = await http().get('/legal/privacy').expect(200);
      expect(fr.headers['content-type']).toContain('text/html');
      expect(fr.text).toContain('Politique de confidentialité');
      expect(fr.text).toContain('7 jours');
      const ar = await http().get('/legal/privacy').set('Accept-Language', 'ar-TN').expect(200);
      expect(ar.text).toContain('dir="rtl"');
      const deletion = await http().get('/legal/account-deletion?lang=fr').expect(200);
      expect(deletion.text).toContain('Supprimer mon compte');
    });
  });
});
