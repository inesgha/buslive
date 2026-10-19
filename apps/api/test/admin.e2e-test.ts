// Tableau de bord admin : rôles, session web par cookie, modération, réseau, journal.
import {
  type AdminDashboard,
  AdminDashboardSchema,
  type AdminStopProposal,
  type AdminUser,
  type LocalityOption,
  type ModerationAction,
  type NearbyStop,
  type Report,
  TRUST_RULES,
} from '@buslive/shared';
import request from 'supertest';

import { seed } from '../prisma/seed/seed';
import { createTestApp, registerUser, resetDatabase, type TestApp } from './utils';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'un-mot-de-passe-solide';

async function waitFor<T>(
  probe: () => Promise<T | null | undefined | false>,
  timeoutMs = 3000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error('Délai dépassé');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('Admin et modération (e2e)', () => {
  let testApp: TestApp;
  let line10: { id: string; outbound: string };
  let centre: { id: string; latitude: number; longitude: number };
  const tokens: Record<string, string> = {};
  const http = () => request(testApp.app.getHttpServer());
  const auth = (user: string) => ({ Authorization: `Bearer ${tokens[user]}` });
  const user = (name: string) =>
    testApp.prisma.user.findUniqueOrThrow({ where: { email: `${name}@example.tn` } });

  /** Donne un rôle puis reconnecte (le rôle est inscrit dans l'access token). */
  async function promote(name: string, role: 'MODERATOR' | 'ADMIN') {
    await testApp.prisma.user.update({ where: { email: `${name}@example.tn` }, data: { role } });
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: `${name}@example.tn`, password: PASSWORD })
      .expect(200);
    tokens[name] = login.body.tokens.accessToken;
  }

  async function report(name: string, body: object): Promise<Report> {
    const response = await http().post('/api/v1/reports').set(auth(name)).send(body).expect(201);
    return response.body as Report;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    await resetDatabase(testApp.prisma);
    await seed(testApp.prisma, { demo: true });
    const l10 = await testApp.prisma.line.findFirstOrThrow({
      where: { code: '10' },
      include: { directions: true },
    });
    line10 = { id: l10.id, outbound: l10.directions.find((d) => d.direction === 'OUTBOUND')!.id };
    centre = await testApp.prisma.stop.findUniqueOrThrow({ where: { code: 'ksour-essef-centre' } });

    for (const name of ['admin', 'modo', 'usager', 'auteur', 'b', 'c', 'conducteur']) {
      tokens[name] = await registerUser(testApp, `${name}@example.tn`);
    }
    await promote('admin', 'ADMIN');
    await promote('modo', 'MODERATOR');
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('rôles', () => {
    it('un compte simple n’a accès à rien (403)', async () => {
      await http().get('/api/v1/admin/dashboard').set(auth('usager')).expect(403);
      await http().get('/api/v1/admin/reports').set(auth('usager')).expect(403);
    });

    it('un modérateur voit le tableau de bord, mais pas le réseau ni les rôles', async () => {
      const response = await http().get('/api/v1/admin/dashboard').set(auth('modo')).expect(200);
      expect(AdminDashboardSchema.safeParse(response.body).success).toBe(true);
      await http().get('/api/v1/admin/governorates').set(auth('modo')).expect(403);
      const target = await user('usager');
      await http()
        .put(`/api/v1/admin/users/${target.id}/role`)
        .set(auth('modo'))
        .send({ role: 'MODERATOR' })
        .expect(403);
    });
  });

  describe('session web (cookie httpOnly)', () => {
    const login = (name: string, origin = ORIGIN) =>
      http()
        .post('/api/v1/auth/web/login')
        .set('Origin', origin)
        .send({ email: `${name}@example.tn`, password: PASSWORD });
    const cookieOf = (response: request.Response) =>
      ([] as string[])
        .concat(response.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('buslive_rt='));

    it('refuse un compte simple, sans poser de cookie', async () => {
      const response = await login('usager').expect(403);
      expect(cookieOf(response)).toBeUndefined();
    });

    it('refuse une origine inconnue (CSRF)', async () => {
      await login('modo', 'https://site-pirate.example').expect(403);
      await http().post('/api/v1/auth/web/refresh').expect(403);
    });

    it('le refresh token est dans un cookie httpOnly, jamais dans le corps', async () => {
      const response = await login('modo').expect(200);
      expect(response.body).toMatchObject({ user: { role: 'MODERATOR' } });
      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(JSON.stringify(response.body)).not.toContain('refreshToken');
      const cookie = cookieOf(response)!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth\/web/);

      // Rafraîchissement avec le cookie, puis rotation : l'ancien cookie ne marche plus.
      const value = cookie.split(';')[0]!;
      const refreshed = await http()
        .post('/api/v1/auth/web/refresh')
        .set('Origin', ORIGIN)
        .set('Cookie', value)
        .expect(200);
      expect(cookieOf(refreshed)).not.toBe(cookie);
      await http()
        .post('/api/v1/auth/web/refresh')
        .set('Origin', ORIGIN)
        .set('Cookie', value)
        .expect(401);
    });

    it('la déconnexion efface le cookie et la session', async () => {
      const response = await login('admin').expect(200);
      const value = cookieOf(response)!.split(';')[0]!;
      const logout = await http()
        .post('/api/v1/auth/web/logout')
        .set('Origin', ORIGIN)
        .set('Cookie', value)
        .expect(204);
      expect(cookieOf(logout)).toMatch(/buslive_rt=;/);
      await http()
        .post('/api/v1/auth/web/refresh')
        .set('Origin', ORIGIN)
        .set('Cookie', value)
        .expect(401);
    });
  });

  describe('signalements', () => {
    it('un modérateur confirme : l’auteur gagne ses points, une seule fois', async () => {
      const created = await report('auteur', {
        type: 'BREAKDOWN',
        lineId: line10.id,
        directionId: line10.outbound,
      });
      await http()
        .post(`/api/v1/admin/reports/${created.id}/decision`)
        .set(auth('modo'))
        .send({ decision: 'CONFIRM' })
        .expect(204);
      expect((await user('auteur')).trustScore).toBe(TRUST_RULES.points.REPORT_CONFIRMED);
      await http()
        .post(`/api/v1/admin/reports/${created.id}/decision`)
        .set(auth('modo'))
        .send({ decision: 'REJECT' })
        .expect(409);
      expect((await user('auteur')).trustScore).toBe(TRUST_RULES.points.REPORT_CONFIRMED);
    });

    it('les signalements contestés sont listés, et peuvent être démentis', async () => {
      const contested = await report('usager', {
        type: 'FULL',
        lineId: line10.id,
        directionId: line10.outbound,
      });
      await http()
        .post(`/api/v1/reports/${contested.id}/votes`)
        .set(auth('b'))
        .send({ value: 'CONFIRM' })
        .expect(201);
      await http()
        .post(`/api/v1/reports/${contested.id}/votes`)
        .set(auth('c'))
        .send({ value: 'DENY' })
        .expect(201);
      const list = await http()
        .get('/api/v1/admin/reports')
        .query({ contested: 'true' })
        .set(auth('modo'))
        .expect(200);
      expect(list.body).toEqual([
        expect.objectContaining({
          id: contested.id,
          author: expect.objectContaining({ displayName: 'Passager' }),
        }),
      ]);
      await http()
        .post(`/api/v1/admin/reports/${contested.id}/decision`)
        .set(auth('modo'))
        .send({ decision: 'REJECT' })
        .expect(204);
      const stored = await testApp.prisma.report.findUniqueOrThrow({ where: { id: contested.id } });
      expect(stored.status).toBe('REJECTED');
    });
  });

  describe('arrêts déplacés', () => {
    it('applique la position confirmée par les passagers, une seule fois', async () => {
      const proposed = { latitude: centre.latitude + 0.0005, longitude: centre.longitude + 0.0004 };
      const moved = await report('auteur', {
        type: 'STOP_MOVED',
        lineId: line10.id,
        stopId: centre.id,
        position: { ...proposed, accuracy: 8 },
      });
      for (const voter of ['b', 'c']) {
        await http()
          .post(`/api/v1/reports/${moved.id}/votes`)
          .set(auth(voter))
          .send({ value: 'CONFIRM' })
          .expect(201);
      }
      const queue = await http().get('/api/v1/admin/stop-moves').set(auth('modo')).expect(200);
      expect(queue.body).toEqual([
        expect.objectContaining({
          reportId: moved.id,
          stop: expect.objectContaining({ id: centre.id }),
        }),
      ]);
      await http()
        .post(`/api/v1/admin/stop-moves/${moved.id}/decision`)
        .set(auth('modo'))
        .send({ apply: true })
        .expect(204);
      const stop = await testApp.prisma.stop.findUniqueOrThrow({ where: { id: centre.id } });
      expect(stop).toMatchObject(proposed);
      await http()
        .post(`/api/v1/admin/stop-moves/${moved.id}/decision`)
        .set(auth('modo'))
        .send({ apply: false })
        .expect(409);
    });
  });

  describe('arrêts proposés par les passagers', () => {
    const here = { latitude: 35.501, longitude: 11.05, accuracy: 10 };
    let proposalId: string;

    it('une proposition reste invisible dans l’app tant qu’elle n’est pas approuvée', async () => {
      const response = await http()
        .post('/api/v1/stops/proposals')
        .set(auth('usager'))
        .send({ nameFr: 'Hiboun plage', ...here, lineIds: [line10.id] })
        .expect(201);
      proposalId = response.body.id;
      expect(response.body).toMatchObject({ status: 'PENDING', lines: [{ code: '10' }] });
      const nearby = await http()
        .get('/api/v1/stops/nearby')
        .query({ lat: here.latitude, lng: here.longitude, radius: 200 })
        .expect(200);
      expect((nearby.body as NearbyStop[]).map((s) => s.id)).not.toContain(proposalId);
    });

    it('refuse un doublon (< 30 m) et une zone non couverte', async () => {
      await http()
        .post('/api/v1/stops/proposals')
        .set(auth('b'))
        .send({ nameFr: 'Doublon', ...here, latitude: here.latitude + 0.0001 })
        .expect(409);
      await http()
        .post('/api/v1/stops/proposals')
        .set(auth('b'))
        .send({ nameFr: 'Tunis Marine', latitude: 36.8, longitude: 10.19, accuracy: 10 })
        .expect(400);
    });

    it('approuvée avec un nom arabe : visible, points et notification pour le proposant', async () => {
      const list = await http().get('/api/v1/admin/stop-proposals').set(auth('modo')).expect(200);
      const listed = (list.body as AdminStopProposal[]).find((p) => p.id === proposalId);
      expect(listed).toMatchObject({ governorateCode: 'TN-53', nearestStop: expect.any(Object) });

      const before = (await user('usager')).trustScore;
      await http()
        .post(`/api/v1/admin/stop-proposals/${proposalId}/decision`)
        .set(auth('modo'))
        .send({ decision: 'APPROVE', nameAr: 'شاطئ هيبون' })
        .expect(204);
      expect((await user('usager')).trustScore).toBe(before + TRUST_RULES.points.STOP_APPROVED);
      const nearby = await http()
        .get('/api/v1/stops/nearby')
        .query({ lat: here.latitude, lng: here.longitude, radius: 200 })
        .expect(200);
      expect(nearby.body[0]).toMatchObject({ id: proposalId, nameAr: 'شاطئ هيبون' });
      await waitFor(() =>
        testApp.prisma.notification.findFirst({ where: { type: 'STOP_PROPOSAL_REVIEWED' } }),
      );
      const mine = await http().get('/api/v1/me/stop-proposals').set(auth('usager')).expect(200);
      expect(mine.body[0]).toMatchObject({ id: proposalId, status: 'ACTIVE' });
    });
  });

  describe('covoiturage signalé', () => {
    it('annuler une annonce signalée : passagers prévenus, signalements classés', async () => {
      await http()
        .patch('/api/v1/me')
        .set(auth('conducteur'))
        .send({ phone: '22 333 444' })
        .expect(200);
      const localities = (await http().get('/api/v1/localities').expect(200))
        .body as LocalityOption[];
      const byCode = (code: string) => localities.find((l) => l.code === code)!.id;
      const offer = await http()
        .post('/api/v1/rides')
        .set(auth('conducteur'))
        .send({
          fromLocalityId: byCode('mahdia'),
          toLocalityId: byCode('sousse'),
          departureAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
          seats: 3,
          priceMillimes: 5000,
        })
        .expect(201);
      for (const name of ['b', 'c']) {
        await http()
          .post(`/api/v1/rides/${offer.body.id}/flags`)
          .set(auth(name))
          .send({ reason: 'FAKE' })
          .expect(204);
      }
      const flags = await http().get('/api/v1/admin/ride-flags').set(auth('modo')).expect(200);
      expect(flags.body[0]).toMatchObject({ offerId: offer.body.id, total: 2 });
      await http()
        .post(`/api/v1/admin/ride-flags/${offer.body.id}/decision`)
        .set(auth('modo'))
        .send({ action: 'CANCEL' })
        .expect(204);
      const stored = await testApp.prisma.rideOffer.findUniqueOrThrow({
        where: { id: offer.body.id },
      });
      expect(stored.status).toBe('CANCELLED');
      const after = await http().get('/api/v1/admin/ride-flags').set(auth('modo')).expect(200);
      expect(after.body).toEqual([]);
    });
  });

  describe('comptes', () => {
    it('suspendre : connexion refusée et sessions révoquées ; puis réactiver', async () => {
      const target = await user('c');
      const mobileLogin = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'c@example.tn', password: PASSWORD })
        .expect(200);
      const response = await http()
        .post(`/api/v1/admin/users/${target.id}/suspension`)
        .set(auth('modo'))
        .send({ suspended: true })
        .expect(200);
      expect((response.body as AdminUser).suspendedAt).not.toBeNull();
      await http()
        .post('/api/v1/auth/login')
        .send({ email: 'c@example.tn', password: PASSWORD })
        .expect(403);
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: mobileLogin.body.tokens.refreshToken })
        .expect(401);
      await http()
        .post(`/api/v1/admin/users/${target.id}/suspension`)
        .set(auth('modo'))
        .send({ suspended: false })
        .expect(200);
      await http()
        .post('/api/v1/auth/login')
        .send({ email: 'c@example.tn', password: PASSWORD })
        .expect(200);
    });

    it('un modérateur ne peut agir ni sur un admin, ni sur lui-même', async () => {
      const admin = await user('admin');
      const modo = await user('modo');
      for (const id of [admin.id, modo.id]) {
        await http()
          .post(`/api/v1/admin/users/${id}/suspension`)
          .set(auth('modo'))
          .send({ suspended: true })
          .expect(403);
      }
    });

    it('un admin change le rôle d’un autre compte, jamais le sien', async () => {
      const target = await user('b');
      const response = await http()
        .put(`/api/v1/admin/users/${target.id}/role`)
        .set(auth('admin'))
        .send({ role: 'MODERATOR' })
        .expect(200);
      expect(response.body.role).toBe('MODERATOR');
      const admin = await user('admin');
      await http()
        .put(`/api/v1/admin/users/${admin.id}/role`)
        .set(auth('admin'))
        .send({ role: 'USER' })
        .expect(403);
      const search = await http()
        .get('/api/v1/admin/users')
        .query({ q: 'B@EXAMPLE' })
        .set(auth('modo'))
        .expect(200);
      expect(search.body).toEqual([expect.objectContaining({ id: target.id, hasPhone: false })]);
    });
  });

  describe('réseau (administrateurs)', () => {
    it('ouvre un gouvernorat', async () => {
      await http()
        .patch('/api/v1/admin/governorates/TN-51')
        .set(auth('admin'))
        .send({ isActive: true })
        .expect(204);
      const visible = await http().get('/api/v1/governorates').expect(200);
      expect(visible.body.map((g: { code: string }) => g.code)).toContain('TN-51');
    });

    it('corrige un arrêt', async () => {
      await http()
        .patch(`/api/v1/admin/stops/${centre.id}`)
        .set(auth('admin'))
        .send({ nameFr: 'Ksour Essef – Centre-ville' })
        .expect(204);
      const stops = await http()
        .get('/api/v1/admin/stops')
        .query({ q: 'centre-ville' })
        .set(auth('admin'))
        .expect(200);
      expect(stops.body[0]).toMatchObject({
        id: centre.id,
        lines: expect.arrayContaining([expect.objectContaining({ code: '10' })]),
      });
    });

    it('crée, modifie et archive une station de louage ; refuse un code en double', async () => {
      const localities = (await http().get('/api/v1/localities').expect(200))
        .body as LocalityOption[];
      const sousse = localities.find((l) => l.code === 'sousse')!;
      const mahdia = localities.find((l) => l.code === 'mahdia')!;
      const body = {
        code: 'sousse-louage',
        nameFr: 'Station de louages de Sousse',
        nameAr: 'محطة اللواج بسوسة',
        latitude: 35.8254,
        longitude: 10.6084,
        localityId: sousse.id,
        openingMinutes: 300,
        closingMinutes: 1260,
        routes: [{ destinationLocalityId: mahdia.id, priceMillimes: 5500, durationMinutes: 75 }],
      };
      const created = await http()
        .post('/api/v1/admin/louage-stations')
        .set(auth('admin'))
        .send(body)
        .expect(201);
      expect(created.body).toMatchObject({
        governorateCode: 'TN-51',
        routes: [{ priceMillimes: 5500 }],
      });
      await http().post('/api/v1/admin/louage-stations').set(auth('admin')).send(body).expect(409);
      const updated = await http()
        .put(`/api/v1/admin/louage-stations/${created.body.id}`)
        .set(auth('admin'))
        .send({ ...body, routes: [{ ...body.routes[0], priceMillimes: 6000 }] })
        .expect(200);
      expect(updated.body.routes).toEqual([expect.objectContaining({ priceMillimes: 6000 })]);
      await http()
        .delete(`/api/v1/admin/louage-stations/${created.body.id}`)
        .set(auth('admin'))
        .expect(204);
      const nearby = await http()
        .get('/api/v1/louage/stations/nearby')
        .query({ lat: body.latitude, lng: body.longitude, radius: 1000 })
        .expect(200);
      expect(nearby.body).toEqual([]);
    });
  });

  describe('journal de modération', () => {
    it('chaque action est écrite, avec son auteur', async () => {
      const response = await http()
        .get('/api/v1/admin/moderation-log')
        .query({ limit: 200 })
        .set(auth('modo'))
        .expect(200);
      const types = new Set((response.body as ModerationAction[]).map((a) => a.type));
      for (const type of [
        'REPORT_CONFIRMED',
        'REPORT_REJECTED',
        'STOP_MOVE_APPLIED',
        'STOP_APPROVED',
        'RIDE_CANCELLED',
        'USER_SUSPENDED',
        'USER_REINSTATED',
        'USER_ROLE_CHANGED',
        'GOVERNORATE_UPDATED',
        'STOP_UPDATED',
        'LOUAGE_STATION_SAVED',
        'LOUAGE_STATION_ARCHIVED',
      ]) {
        expect(types).toContain(type);
      }
      expect((response.body as ModerationAction[])[0]!.moderator.displayName).toBe('Passager');
    });

    it('le journal ne peut être ni modifié ni effacé, même en SQL direct', async () => {
      await expect(testApp.prisma.moderationAction.deleteMany({})).rejects.toThrow();
      await expect(
        testApp.prisma.moderationAction.updateMany({ data: { targetId: 'falsifié' } }),
      ).rejects.toThrow();
    });

    it('le tableau de bord reflète les files vidées', async () => {
      const response = await http().get('/api/v1/admin/dashboard').set(auth('admin')).expect(200);
      const dashboard = response.body as AdminDashboard;
      expect(dashboard.queues).toEqual({
        contestedReports: 0,
        stopMoves: 0,
        stopProposals: 0,
        rideFlags: 0,
      });
      expect(dashboard.users.total).toBe(7);
      expect(dashboard.topReportedLines[0]).toMatchObject({ code: '10' });
    });
  });
});
