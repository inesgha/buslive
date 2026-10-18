// Réseau de transport : seed, filtres de visibilité, détail des lignes, PostGIS.
import { randomUUID } from 'node:crypto';

import {
  departuresForDate,
  GovernorateSchema,
  type LineDetail,
  LineDetailSchema,
  type LineSummary,
  LineSummarySchema,
  minutesToTime,
  type NearbyStop,
  NearbyStopSchema,
  type StopDepartures,
  StopDeparturesSchema,
  StopDetailSchema,
} from '@buslive/shared';
import request from 'supertest';
import { z } from 'zod';

import { seed, type SeedSummary } from '../prisma/seed/seed';
import { createTestApp, resetDatabase, type TestApp } from './utils';

describe('Réseau (e2e)', () => {
  let testApp: TestApp;
  let firstSeed: SeedSummary;
  const http = () => request(testApp.app.getHttpServer());

  async function getLines(query = ''): Promise<LineSummary[]> {
    const response = await http().get(`/api/v1/lines${query}`).expect(200);
    return response.body as LineSummary[];
  }

  async function getLineByCode(code: string): Promise<LineDetail> {
    const summary = (await getLines('?governorate=TN-53')).find((line) => line.code === code);
    if (!summary) throw new Error(`Ligne ${code} absente`);
    const response = await http().get(`/api/v1/lines/${summary.id}`).expect(200);
    return response.body as LineDetail;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    await resetDatabase(testApp.prisma);
    firstSeed = await seed(testApp.prisma, { demo: true });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('seed', () => {
    it('est idempotent : un second passage ne crée aucun doublon', async () => {
      const count = () =>
        Promise.all([
          testApp.prisma.governorate.count(),
          testApp.prisma.stop.count(),
          testApp.prisma.line.count(),
          testApp.prisma.lineStop.count(),
          testApp.prisma.departure.count(),
        ]);
      const before = await count();
      expect(await seed(testApp.prisma, { demo: true })).toEqual(firstSeed);
      expect(await count()).toEqual(before);
    });

    it('sans démo (production), n’insère que les gouvernorats', async () => {
      const summary = await seed(testApp.prisma, { demo: false });
      expect(summary).toMatchObject({ governorates: 24, lines: 0, stops: 0 });
    });
  });

  describe('PostGIS', () => {
    it('le trigger calcule le point de chaque arrêt', async () => {
      const [row] = await testApp.prisma.$queryRaw<{ missing: number }[]>`
        SELECT count(*)::int AS missing FROM stops WHERE location IS NULL
      `;
      expect(row?.missing).toBe(0);
    });

    it('calcule la distance Mahdia – Ksour Essef (≈ 11 km à vol d’oiseau)', async () => {
      const [row] = await testApp.prisma.$queryRaw<{ km: number }[]>`
        SELECT ST_Distance(a.location, b.location) / 1000 AS km
        FROM stops a, stops b
        WHERE a.code = 'mahdia-gare-routiere' AND b.code = 'ksour-essef-centre'
      `;
      expect(row?.km).toBeGreaterThan(9);
      expect(row?.km).toBeLessThan(13);
    });

    it('trouve les arrêts proches grâce à l’index spatial (ST_DWithin)', async () => {
      const nearby = await testApp.prisma.$queryRaw<{ code: string }[]>`
        SELECT code FROM stops
        WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(11.0473, 35.4978), 4326)::geography, 1000)
        ORDER BY code
      `;
      const codes = nearby.map((stop) => stop.code);
      expect(codes).toContain('mahdia-gare-routiere');
      expect(codes).not.toContain('ksour-essef-centre');
    });
  });

  describe('GET /governorates', () => {
    it('ne renvoie que les gouvernorats actifs', async () => {
      const response = await http().get('/api/v1/governorates').expect(200);
      expect(z.array(GovernorateSchema).safeParse(response.body).success).toBe(true);
      expect(response.body).toEqual([
        expect.objectContaining({ code: 'TN-53', nameAr: 'المهدية' }),
      ]);
    });
  });

  describe('GET /lines', () => {
    it('renvoie les lignes actives, triées naturellement (1, 2, 10, 11)', async () => {
      const lines = await getLines('?governorate=TN-53');
      expect(z.array(LineSummarySchema).safeParse(lines).success).toBe(true);
      expect(lines.map((line) => line.code)).toEqual(['1', '2', '10', '11']);
    });

    it('refuse un code de gouvernorat invalide (400)', async () => {
      await http().get('/api/v1/lines?governorate=Mahdia').expect(400);
    });

    it('n’affiche ni les lignes en attente ni celles d’un gouvernorat inactif', async () => {
      const sousse = await testApp.prisma.governorate.findUniqueOrThrow({
        where: { code: 'TN-51' },
      });
      const mahdia = await testApp.prisma.governorate.findUniqueOrThrow({
        where: { code: 'TN-53' },
      });
      await testApp.prisma.line.createMany({
        data: [
          {
            code: '99',
            governorateId: mahdia.id,
            nameFr: 'En attente',
            nameAr: 'قيد الانتظار',
            type: 'URBAN',
            color: '#000000',
            status: 'PENDING',
          },
          {
            code: '5',
            governorateId: sousse.id,
            nameFr: 'Sousse',
            nameAr: 'سوسة',
            type: 'URBAN',
            color: '#000000',
            status: 'ACTIVE',
          },
        ],
      });

      const codes = (await getLines()).map((line) => line.code);
      expect(codes).not.toContain('99');
      expect(codes).not.toContain('5');

      await testApp.prisma.line.deleteMany({ where: { code: { in: ['99', '5'] } } });
    });
  });

  describe('GET /lines/:id', () => {
    it('renvoie un détail conforme au schéma partagé', async () => {
      const line = await getLineByCode('10');
      const parsed = LineDetailSchema.safeParse(line);
      expect(parsed.success).toBe(true);
    });

    it('liste les arrêts dans l’ordre, aller et retour', async () => {
      const line = await getLineByCode('10');
      const [outbound, inbound] = line.directions;
      expect(outbound?.direction).toBe('OUTBOUND');
      expect(outbound?.stops.map((s) => s.stop.code)).toEqual([
        'mahdia-gare-routiere',
        'rejiche-centre',
        'ksour-essef-station',
        'ksour-essef-centre',
        'ksour-essef-lycee',
      ]);
      // Retour : arrêts inversés, temps recalculés depuis le nouveau terminus.
      expect(inbound?.stops.map((s) => s.stop.code)[0]).toBe('ksour-essef-lycee');
      expect(inbound?.stops.map((s) => s.minutesFromStart)).toEqual([0, 4, 7, 22, 34]);
    });

    it('fournit un tracé qui part du premier arrêt', async () => {
      const [outbound] = (await getLineByCode('10')).directions;
      expect(outbound?.shape).toHaveLength(5);
      expect(outbound?.shape?.[0]).toEqual({ latitude: 35.4978, longitude: 11.0473 });
    });

    it('contient de quoi calculer les horaires hors ligne', async () => {
      const line = await getLineByCode('10');
      const [outbound] = line.directions;
      if (!outbound) throw new Error('sens aller absent');
      // Lundi ordinaire : horaires « Semaine ».
      expect(
        departuresForDate(outbound.departures, line.calendars, '2026-10-19').map(minutesToTime),
      ).toEqual(['06:00', '07:00', '08:30', '10:00', '12:00', '13:30', '15:00', '17:00', '18:30']);
      // Lundi pendant le Ramadan : horaires « Ramadan » prioritaires.
      expect(
        departuresForDate(outbound.departures, line.calendars, '2027-02-15').map(minutesToTime),
      ).toEqual(['07:30', '09:30', '11:30', '13:30', '15:30']);
    });

    it('masque un arrêt passé en attente', async () => {
      await testApp.prisma.stop.update({
        where: { code: 'rejiche-centre' },
        data: { status: 'PENDING' },
      });
      const [outbound] = (await getLineByCode('10')).directions;
      expect(outbound?.stops.map((s) => s.stop.code)).not.toContain('rejiche-centre');
      await testApp.prisma.stop.update({
        where: { code: 'rejiche-centre' },
        data: { status: 'ACTIVE' },
      });
    });

    it('répond 404 pour une ligne inconnue et 400 pour un identifiant invalide', async () => {
      await http().get(`/api/v1/lines/${randomUUID()}`).expect(404);
      await http().get('/api/v1/lines/pas-un-uuid').expect(400);
    });
  });

  describe('GET /stops/:id', () => {
    it('renvoie l’arrêt et les lignes qui le desservent', async () => {
      const stop = await testApp.prisma.stop.findUniqueOrThrow({
        where: { code: 'mahdia-gare-routiere' },
      });
      const response = await http().get(`/api/v1/stops/${stop.id}`).expect(200);
      expect(StopDetailSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.locality).toEqual({
        code: 'mahdia',
        nameFr: 'Mahdia',
        nameAr: 'المهدية',
      });
      const codes = (response.body.lines as { code: string }[]).map((line) => line.code);
      expect(codes).toEqual(['1', '2', '10']);
    });

    it('répond 404 pour un arrêt en attente', async () => {
      const stop = await testApp.prisma.stop.update({
        where: { code: 'salakta-plage' },
        data: { status: 'PENDING' },
      });
      await http().get(`/api/v1/stops/${stop.id}`).expect(404);
      await testApp.prisma.stop.update({
        where: { code: 'salakta-plage' },
        data: { status: 'ACTIVE' },
      });
    });
  });

  describe('GET /stops/nearby', () => {
    // Point : gare routière de Mahdia.
    const nearGare = 'lat=35.4978&lng=11.0473';

    it('renvoie les arrêts du rayon, du plus proche au plus loin', async () => {
      const response = await http().get(`/api/v1/stops/nearby?${nearGare}&radius=1500`).expect(200);
      expect(z.array(NearbyStopSchema).safeParse(response.body).success).toBe(true);
      const stops = response.body as NearbyStop[];
      expect(stops.map((stop) => stop.code)).toEqual([
        'mahdia-gare-routiere',
        'mahdia-centre-ville',
        'mahdia-hopital',
      ]);
      const distances = stops.map((stop) => stop.distanceMeters);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
      expect(distances[0]).toBe(0);
      expect(stops[0]?.lines.map((line) => line.code)).toEqual(['1', '2', '10']);
    });

    it('respecte le rayon par défaut (800 m) et la limite', async () => {
      const byDefault = await http().get(`/api/v1/stops/nearby?${nearGare}`).expect(200);
      expect((byDefault.body as NearbyStop[]).map((stop) => stop.code)).toEqual([
        'mahdia-gare-routiere',
      ]);
      const limited = await http()
        .get(`/api/v1/stops/nearby?${nearGare}&radius=3000&limit=2`)
        .expect(200);
      expect(limited.body).toHaveLength(2);
    });

    it('ne renvoie rien loin du réseau (Tunis)', async () => {
      await http().get('/api/v1/stops/nearby?lat=36.8065&lng=10.1815').expect(200).expect([]);
    });

    it.each([
      ['lat=abc&lng=11', 'latitude invalide'],
      ['lng=11', 'latitude manquante'],
      [`lat=35.5&lng=11&radius=10000`, 'rayon trop grand'],
      [`lat=35.5&lng=11&limit=500`, 'limite trop grande'],
    ])('refuse « %s » (%s) avec 400', async (query) => {
      await http().get(`/api/v1/stops/nearby?${query}`).expect(400);
    });
  });

  describe('GET /stops/:id/departures', () => {
    async function departuresAt(stopCode: string, at: string, limit?: number) {
      const stop = await testApp.prisma.stop.findUniqueOrThrow({ where: { code: stopCode } });
      const query = new URLSearchParams({ at, ...(limit && { limit: String(limit) }) });
      const response = await http().get(`/api/v1/stops/${stop.id}/departures?${query}`).expect(200);
      expect(StopDeparturesSchema.safeParse(response.body).success).toBe(true);
      return response.body as StopDepartures;
    }

    it('calcule les prochains passages (lundi 07:50, Ksour Essef – Centre)', async () => {
      // 06:50 UTC = 07:50 à Tunis.
      const { passages } = await departuresAt('ksour-essef-centre', '2026-10-19T06:50:00Z', 4);
      expect(passages.map((p) => minutesToTime(p.passingMinutes))).toEqual([
        '09:00', // ligne 10 vers Ksour Essef (départ 08:30 + 30 min) et…
        '09:00', // … ligne 11 vers Salakta (départ 09:00, terminus)
        '09:19', // ligne 10 vers Mahdia (départ 09:15 + 4 min)
        '09:43', // ligne 11 vers Ksour Essef (départ 09:30 + 13 min)
      ]);
      expect(passages.every((p) => p.serviceDate === '2026-10-19' && p.live === null)).toBe(true);
      expect(new Set(passages.map((p) => p.line.code))).toEqual(new Set(['10', '11']));
    });

    it('utilise les horaires du Ramadan pendant le Ramadan', async () => {
      // Lundi 15/02/2027, 07:00 à Tunis : ligne 10 en horaires Ramadan (07:30 → 08:00 à l'arrêt).
      const { passages } = await departuresAt('ksour-essef-centre', '2027-02-15T06:00:00Z');
      const line10 = passages.filter(
        (p) => p.line.code === '10' && p.direction.direction === 'OUTBOUND',
      );
      expect(minutesToTime(line10[0]!.passingMinutes)).toBe('08:00');
      // La ligne 11 n'a pas d'horaires Ramadan : ses horaires de semaine s'appliquent.
      const line11 = passages.filter(
        (p) => p.line.code === '11' && p.direction.direction === 'OUTBOUND',
      );
      expect(minutesToTime(line11[0]!.passingMinutes)).toBe('07:00');
    });

    it('passe au lendemain le soir après le dernier bus', async () => {
      // Lundi 23:00 à Tunis : plus de bus, les premiers passages sont mardi.
      const { passages } = await departuresAt('ksour-essef-centre', '2026-10-19T22:00:00Z', 1);
      expect(passages[0]?.serviceDate).toBe('2026-10-20');
      expect(minutesToTime(passages[0]!.passingMinutes)).toBe('06:30');
    });

    it('répond 404 pour un arrêt inconnu et 400 pour une date invalide', async () => {
      await http().get(`/api/v1/stops/${randomUUID()}/departures`).expect(404);
      const stop = await testApp.prisma.stop.findUniqueOrThrow({
        where: { code: 'salakta-plage' },
      });
      await http().get(`/api/v1/stops/${stop.id}/departures?at=hier`).expect(400);
    });
  });
});
