// Import GTFS dans une vraie base : essai à blanc, import, ré-import (idempotent).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { LineDetail, LineSummary } from '@buslive/shared';
import request from 'supertest';

import { seed } from '../prisma/seed/seed';
import { applyImportPlan } from '../src/gtfs/gtfs-apply';
import { buildImportPlan } from '../src/gtfs/gtfs-plan';
import { createTestApp, resetDatabase, type TestApp } from './utils';

// Les tests e2e tournent depuis apps/api (mode ESM : pas de __dirname).
const folder = path.join(process.cwd(), 'test', 'fixtures', 'gtfs-mini');
const files = Object.fromEntries(
  readdirSync(folder).map((name) => [name, readFileSync(path.join(folder, name), 'utf8')]),
);
const plan = buildImportPlan(files, { prefix: 'srt-', lineType: 'URBAN' });

describe('Import GTFS (e2e)', () => {
  let testApp: TestApp;
  const http = () => request(testApp.app.getHttpServer());

  beforeAll(async () => {
    testApp = await createTestApp();
    await resetDatabase(testApp.prisma);
    // Gouvernorats seulement : le réseau vient du GTFS.
    await seed(testApp.prisma, { demo: false });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('l’essai à blanc compte ce qui serait créé, sans rien écrire', async () => {
    const summary = await applyImportPlan(testApp.prisma, plan, {
      governorateCode: 'TN-53',
      dryRun: true,
    });
    expect(summary).toMatchObject({
      stops: { created: 3, updated: 0 },
      calendars: { created: 2, updated: 0 },
      lines: { created: 1, updated: 0 },
      departures: 4,
    });
    expect(await testApp.prisma.line.count()).toBe(0);
  });

  it('importe un réseau visible dans l’app, avec ses horaires et son tracé', async () => {
    await applyImportPlan(testApp.prisma, plan, { governorateCode: 'TN-53', dryRun: false });
    const lines = (await http().get('/api/v1/lines').expect(200)).body as LineSummary[];
    expect(lines.map((l) => l.code)).toEqual(['G1']);

    const detail = (await http().get(`/api/v1/lines/${lines[0]!.id}`).expect(200))
      .body as LineDetail;
    const outbound = detail.directions.find((d) => d.direction === 'OUTBOUND')!;
    expect(outbound.headsignFr).toBe('vers Skanes');
    expect(outbound.stops.map((s) => [s.stop.nameFr, s.minutesFromStart])).toEqual([
      ['Hiboun', 0],
      ['Zone touristique, hôtels', 9],
      ['Skanes Mahdia', 20],
    ]);
    expect(outbound.departures.map((d) => d.departureMinutes)).toEqual([420, 480, 1470]);
    expect(outbound.shape).toHaveLength(4);
    expect(detail.calendars.map((c) => c.code).sort()).toEqual(['srt-SEM', 'srt-WE']);
  });

  it('ré-importer ne crée aucun doublon', async () => {
    const summary = await applyImportPlan(testApp.prisma, plan, {
      governorateCode: 'TN-53',
      dryRun: false,
    });
    expect(summary.lines).toEqual({ created: 0, updated: 1 });
    expect(await testApp.prisma.stop.count()).toBe(3);
    expect(await testApp.prisma.departure.count()).toBe(4);
    expect(await testApp.prisma.lineStop.count()).toBe(6);
  });

  it('les arrêts importés sont trouvés par la recherche de proximité (PostGIS)', async () => {
    const nearby = await http()
      .get('/api/v1/stops/nearby')
      .query({ lat: 35.504, lng: 11.061, radius: 200 })
      .expect(200);
    expect(nearby.body[0]).toMatchObject({ nameFr: 'Hiboun', nameAr: 'هيبون' });
  });
});
