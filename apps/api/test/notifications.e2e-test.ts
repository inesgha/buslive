// Favoris, alertes « mon trajet », appareils et notifications push.
import {
  type Alert,
  AlertSchema,
  type Favorites,
  FavoritesSchema,
  type GeoPoint,
  type NotificationList,
  NotificationListSchema,
  TRUST_RULES,
  tunisClock,
  type UserProfile,
} from '@buslive/shared';
import request from 'supertest';

import { seed } from '../prisma/seed/seed';
import type { MemoryPushSender } from '../src/notifications/push/memory-push-sender';
import { PUSH_SENDER } from '../src/notifications/push/push-sender';
import { createTestApp, registerUser, resetDatabase, type TestApp } from './utils';

// Ligne 10 (aller) : gare de Mahdia (0 min) → Rejiche (12) → Ksour Essef station (27)
// → centre (30) → lycée (34).
const rejiche = { latitude: 35.4705, longitude: 11.0336 };
const station = { latitude: 35.4207, longitude: 10.9889 };
const along = (a: GeoPoint, b: GeoPoint, ratio: number): GeoPoint => ({
  latitude: a.latitude + (b.latitude - a.latitude) * ratio,
  longitude: a.longitude + (b.longitude - a.longitude) * ratio,
});
const sample = (point: GeoPoint, secondsAgo: number) => ({
  ...point,
  accuracy: 10,
  recordedAt: new Date(Date.now() - secondsAgo * 1000).toISOString(),
});

/** Attend qu'une condition devienne vraie (traitements asynchrones de l'API). */
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
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Favoris, alertes et notifications (e2e)', () => {
  let testApp: TestApp;
  let push: MemoryPushSender;
  let line10: { id: string; outbound: string; inbound: string };
  let line1: { id: string; direction: string };
  let stops: Record<'centre' | 'rejiche' | 'cap', string>;
  const tokens: Record<string, string> = {};
  const http = () => request(testApp.app.getHttpServer());
  const auth = (user: string) => ({ Authorization: `Bearer ${tokens[user]}` });

  const userId = async (name: string) =>
    (await testApp.prisma.user.findUniqueOrThrow({ where: { email: `${name}@example.tn` } })).id;

  /** Plage horaire qui contient l'heure actuelle de Tunis, tous les jours. */
  const aroundNow = () => {
    const { minutes } = tunisClock();
    return {
      days: [1, 2, 3, 4, 5, 6, 7],
      startMinutes: Math.max(0, minutes - 60),
      endMinutes: Math.min(1440, minutes + 60),
    };
  };

  const alertBody = (overrides: object = {}) => ({
    lineId: line10.id,
    directionId: line10.outbound,
    stopId: stops.centre,
    leadMinutes: 15,
    ...aroundNow(),
    notifyApproach: true,
    notifyIncidents: true,
    enabled: true,
    ...overrides,
  });

  async function createAlert(user: string, overrides: object = {}, expected = 201) {
    const response = await http()
      .post('/api/v1/me/alerts')
      .set(auth(user))
      .send(alertBody(overrides))
      .expect(expected);
    if (expected === 201) expect(AlertSchema.safeParse(response.body).success).toBe(true);
    return response.body as Alert;
  }

  async function notifications(user: string): Promise<NotificationList> {
    const response = await http().get('/api/v1/me/notifications').set(auth(user)).expect(200);
    expect(NotificationListSchema.safeParse(response.body).success).toBe(true);
    return response.body as NotificationList;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    await resetDatabase(testApp.prisma);
    await seed(testApp.prisma, { demo: true });
    push = testApp.app.get<MemoryPushSender>(PUSH_SENDER);

    const lines = await testApp.prisma.line.findMany({ include: { directions: true } });
    const l10 = lines.find((l) => l.code === '10')!;
    const l1 = lines.find((l) => l.code === '1')!;
    line10 = {
      id: l10.id,
      outbound: l10.directions.find((d) => d.direction === 'OUTBOUND')!.id,
      inbound: l10.directions.find((d) => d.direction === 'INBOUND')!.id,
    };
    line1 = { id: l1.id, direction: l1.directions[0]!.id };
    const byCode = async (code: string) =>
      (await testApp.prisma.stop.findUniqueOrThrow({ where: { code } })).id;
    stops = {
      centre: await byCode('ksour-essef-centre'),
      rejiche: await byCode('rejiche-centre'),
      cap: await byCode('mahdia-cap-afrique'),
    };

    for (const name of ['fan', 'abonne', 'retour', 'auteur', 'b', 'c', 'passager', 'autre']) {
      tokens[name] = await registerUser(testApp, `${name}@example.tn`);
    }
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('favoris', () => {
    it('exigent d’être connecté (401)', async () => {
      await http().get('/api/v1/me/favorites').expect(401);
    });

    it('ajoute une ligne et un arrêt ; ajouter deux fois ne change rien', async () => {
      await http().put(`/api/v1/me/favorites/lines/${line10.id}`).set(auth('fan')).expect(204);
      await http().put(`/api/v1/me/favorites/lines/${line10.id}`).set(auth('fan')).expect(204);
      await http().put(`/api/v1/me/favorites/stops/${stops.rejiche}`).set(auth('fan')).expect(204);

      const response = await http().get('/api/v1/me/favorites').set(auth('fan')).expect(200);
      expect(FavoritesSchema.safeParse(response.body).success).toBe(true);
      const favorites = response.body as Favorites;
      expect(favorites.lines.map((l) => l.code)).toEqual(['10']);
      expect(favorites.stops).toEqual([
        expect.objectContaining({
          id: stops.rejiche,
          lines: expect.arrayContaining([expect.objectContaining({ code: '10' })]),
        }),
      ]);
    });

    it('les favoris sont propres à chaque compte', async () => {
      const response = await http().get('/api/v1/me/favorites').set(auth('autre')).expect(200);
      expect(response.body).toEqual({ lines: [], stops: [] });
    });

    it('retire un favori (idempotent) et refuse une ligne inconnue (404)', async () => {
      await http().delete(`/api/v1/me/favorites/lines/${line10.id}`).set(auth('fan')).expect(204);
      await http().delete(`/api/v1/me/favorites/lines/${line10.id}`).set(auth('fan')).expect(204);
      const response = await http().get('/api/v1/me/favorites').set(auth('fan')).expect(200);
      expect((response.body as Favorites).lines).toEqual([]);
      await http()
        .put('/api/v1/me/favorites/lines/7b0f2c4e-8f43-4d8a-9e0b-3c1a2b4d5e6f')
        .set(auth('fan'))
        .expect(404);
    });
  });

  describe('alertes', () => {
    it('crée une alerte et la liste', async () => {
      const created = await createAlert('fan', { days: [5, 1, 3] });
      expect(created).toMatchObject({
        line: { id: line10.id, code: '10' },
        direction: { id: line10.outbound },
        stop: { id: stops.centre },
        days: [1, 3, 5], // triés
        enabled: true,
      });
      const response = await http().get('/api/v1/me/alerts').set(auth('fan')).expect(200);
      expect((response.body as Alert[]).map((a) => a.id)).toEqual([created.id]);
    });

    it('refuse un arrêt qui n’est pas sur ce sens (404) et une plage à l’envers (400)', async () => {
      await createAlert('fan', { stopId: stops.cap }, 404);
      await createAlert('fan', { startMinutes: 600, endMinutes: 500 }, 400);
    });

    it('modifie et supprime ses alertes, pas celles des autres (404)', async () => {
      const alert = await createAlert('fan');
      await http()
        .put(`/api/v1/me/alerts/${alert.id}`)
        .set(auth('autre'))
        .send(alertBody())
        .expect(404);
      const updated = await http()
        .put(`/api/v1/me/alerts/${alert.id}`)
        .set(auth('fan'))
        .send(alertBody({ enabled: false, leadMinutes: 5 }))
        .expect(200);
      expect(updated.body).toMatchObject({ enabled: false, leadMinutes: 5 });
      await http().delete(`/api/v1/me/alerts/${alert.id}`).set(auth('autre')).expect(404);
      await http().delete(`/api/v1/me/alerts/${alert.id}`).set(auth('fan')).expect(204);
    });

    it('limite le nombre d’alertes (409)', async () => {
      const fan = await userId('fan');
      const existing = await testApp.prisma.alert.count({ where: { userId: fan } });
      await testApp.prisma.alert.createMany({
        data: Array.from({ length: 10 - existing }, () => ({
          userId: fan,
          lineId: line1.id,
          directionId: line1.direction,
          stopId: stops.cap,
          leadMinutes: 10,
          days: [1],
          startMinutes: 0,
          endMinutes: 60,
          // Coupées : elles ne doivent pas interférer avec le reste des tests.
          enabled: false,
        })),
      });
      await createAlert('fan', {}, 409);
    });
  });

  describe('profil et appareils', () => {
    it('change la langue du compte et les préférences (PATCH /me)', async () => {
      const response = await http()
        .patch('/api/v1/me')
        .set(auth('abonne'))
        .send({ locale: 'ar' })
        .expect(200);
      expect(response.body as UserProfile).toMatchObject({
        locale: 'ar',
        notifyReportOutcome: true,
      });
      await http().patch('/api/v1/me').set(auth('abonne')).send({}).expect(400);
    });

    it('enregistre un téléphone ; un jeton qui change de compte change de propriétaire', async () => {
      await http()
        .post('/api/v1/me/push-devices')
        .set(auth('autre'))
        .send({ token: 'jeton-abonne', platform: 'ANDROID' })
        .expect(204);
      await http()
        .post('/api/v1/me/push-devices')
        .set(auth('abonne'))
        .send({ token: 'jeton-abonne', platform: 'ANDROID' })
        .expect(204);
      const device = await testApp.prisma.pushDevice.findUniqueOrThrow({
        where: { token: 'jeton-abonne' },
      });
      expect(device.userId).toBe(await userId('abonne'));
    });

    it('envoie une notification d’essai, dans la langue du compte', async () => {
      push.clear();
      const response = await http()
        .post('/api/v1/me/notifications/test')
        .set(auth('abonne'))
        .expect(200);
      expect(response.body).toEqual({ devices: 1 });
      expect(push.sent).toEqual([
        {
          tokens: ['jeton-abonne'],
          message: expect.objectContaining({
            body: 'الإشعارات تعمل على هذا الهاتف.',
            channelId: 'account',
            data: expect.objectContaining({ type: 'TEST', url: '/alerts' }),
          }),
        },
      ]);
    });

    it('liste les notifications et les marque comme lues', async () => {
      const before = await notifications('abonne');
      expect(before.unread).toBe(1);
      expect(before.items[0]).toMatchObject({ type: 'TEST', readAt: null });
      await http().post('/api/v1/me/notifications/read').set(auth('abonne')).send({}).expect(204);
      expect((await notifications('abonne')).unread).toBe(0);
    });
  });

  describe('bus qui approche (moteur d’alertes)', () => {
    it('un bus en direct à ~10 min de l’arrêt déclenche UNE notification', async () => {
      // « abonne » : arrêt Ksour Essef centre (30 min), prévenir 15 min avant.
      await createAlert('abonne');
      // Délai de 5 min : le bus est encore trop loin pour lui.
      await createAlert('retour', { leadMinutes: 5 });
      // Même arrêt, mais dans l'autre sens : jamais concerné.
      await createAlert('autre', { directionId: line10.inbound });
      push.clear();

      const session = await http()
        .post('/api/v1/live/sessions')
        .set(auth('passager'))
        .send({ lineId: line10.id, directionId: line10.outbound })
        .expect(201);
      // Le bus est à mi-chemin entre Rejiche (12 min) et la station (27 min) :
      // environ 10 min avant le centre de Ksour Essef.
      await http()
        .post(`/api/v1/live/sessions/${session.body.id}/positions`)
        .set(auth('passager'))
        .send({
          points: [
            sample(along(rejiche, station, 0.45), 40),
            sample(along(rejiche, station, 0.5), 20),
          ],
        })
        .expect(200);

      const list = await waitFor(async () => {
        const result = await notifications('abonne');
        return result.items.some((n) => n.type === 'BUS_APPROACHING') ? result : null;
      });
      const approaching = list.items.find((n) => n.type === 'BUS_APPROACHING');
      expect(approaching).toMatchObject({
        data: { lineCode: '10', stopId: stops.centre, etaMinutes: expect.any(Number) },
      });
      if (approaching?.type === 'BUS_APPROACHING') {
        expect(approaching.data.etaMinutes).toBeGreaterThanOrEqual(8);
        expect(approaching.data.etaMinutes).toBeLessThanOrEqual(12);
      }
      // Push en arabe (langue du compte), sur le canal « approaching ».
      const message = push.sent.find((m) => m.tokens.includes('jeton-abonne'))?.message;
      expect(message).toMatchObject({
        title: 'الحافلة 10 نحو قصور الساف',
        channelId: 'approaching',
        data: expect.objectContaining({ url: `/lines/${line10.id}` }),
      });

      // Le bus avance encore : pas de deuxième notification (anti-spam).
      await http()
        .post(`/api/v1/live/sessions/${session.body.id}/positions`)
        .set(auth('passager'))
        .send({ points: [sample(along(rejiche, station, 0.55), 5)] })
        .expect(200);
      await pause(400);
      const again = await notifications('abonne');
      expect(again.items.filter((n) => n.type === 'BUS_APPROACHING')).toHaveLength(1);

      // Ni le délai trop court, ni l'autre sens.
      for (const user of ['retour', 'autre']) {
        const other = await notifications(user);
        expect(other.items.some((n) => n.type === 'BUS_APPROACHING')).toBe(false);
      }
      await http()
        .delete(`/api/v1/live/sessions/${session.body.id}`)
        .set(auth('passager'))
        .expect(200);
    });
  });

  describe('signalements tranchés', () => {
    it('une panne confirmée prévient les abonnés et l’auteur, pas les votants', async () => {
      // « b » a aussi une alerte sur ce trajet, mais il vote : il est déjà au courant.
      await createAlert('b');
      push.clear();

      const created = await http()
        .post('/api/v1/reports')
        .set(auth('auteur'))
        .send({ type: 'BREAKDOWN', lineId: line10.id, directionId: line10.outbound })
        .expect(201);
      for (const voter of ['b', 'c']) {
        await http()
          .post(`/api/v1/reports/${created.body.id}/votes`)
          .set(auth(voter))
          .send({ value: 'CONFIRM' })
          .expect(201);
      }

      const abonne = await waitFor(async () => {
        const result = await notifications('abonne');
        return result.items.some((n) => n.type === 'LINE_INCIDENT') ? result : null;
      });
      expect(abonne.items.find((n) => n.type === 'LINE_INCIDENT')).toMatchObject({
        data: { reportId: created.body.id, reportType: 'BREAKDOWN', lineCode: '10' },
      });

      const auteur = await waitFor(async () => {
        const result = await notifications('auteur');
        return result.items.length > 0 ? result : null;
      });
      expect(auteur.items[0]).toMatchObject({
        type: 'REPORT_RESOLVED',
        data: { status: 'CONFIRMED', points: TRUST_RULES.points.REPORT_CONFIRMED },
      });

      await pause(300);
      expect((await notifications('b')).items.some((n) => n.type === 'LINE_INCIDENT')).toBe(false);
      // L'alerte de l'autre sens n'est pas concernée par une panne vers Ksour Essef.
      expect((await notifications('autre')).items.some((n) => n.type === 'LINE_INCIDENT')).toBe(
        false,
      );
    });

    it('respecte le choix de ne pas être prévenu du résultat de ses signalements', async () => {
      await http()
        .patch('/api/v1/me')
        .set(auth('c'))
        .send({ notifyReportOutcome: false })
        .expect(200);
      const created = await http()
        .post('/api/v1/reports')
        .set(auth('c'))
        .send({ type: 'FULL', lineId: line1.id, directionId: line1.direction })
        .expect(201);
      for (const voter of ['b', 'auteur']) {
        await http()
          .post(`/api/v1/reports/${created.body.id}/votes`)
          .set(auth(voter))
          .send({ value: 'CONFIRM' })
          .expect(201);
      }
      await waitFor(async () => {
        const report = await testApp.prisma.report.findUniqueOrThrow({
          where: { id: created.body.id },
        });
        return report.status === 'CONFIRMED';
      });
      await pause(300);
      expect((await notifications('c')).items).toEqual([]);
    });
  });

  describe('jetons invalides', () => {
    it('un jeton refusé par FCM est supprimé', async () => {
      await http()
        .post('/api/v1/me/push-devices')
        .set(auth('fan'))
        .send({ token: 'jeton-desinstalle', platform: 'ANDROID' })
        .expect(204);
      push.invalid.add('jeton-desinstalle');
      await http().post('/api/v1/me/notifications/test').set(auth('fan')).expect(200);
      expect(
        await testApp.prisma.pushDevice.findUnique({ where: { token: 'jeton-desinstalle' } }),
      ).toBeNull();
    });

    it('à la déconnexion, le téléphone est retiré', async () => {
      await http()
        .post('/api/v1/me/push-devices/unregister')
        .set(auth('abonne'))
        .send({ token: 'jeton-abonne' })
        .expect(204);
      expect(
        await testApp.prisma.pushDevice.count({ where: { userId: await userId('abonne') } }),
      ).toBe(0);
    });
  });
});
