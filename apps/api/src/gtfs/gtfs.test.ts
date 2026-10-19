import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parseCsv, readTable } from './csv';
import { buildImportPlan, GtfsError, gtfsTimeToMinutes } from './gtfs-plan';

/** Le petit réseau de test (test/fixtures/gtfs-mini), lu depuis le disque. */
function fixture(): Record<string, string> {
  const folder = path.join(process.cwd(), 'test', 'fixtures', 'gtfs-mini');
  return Object.fromEntries(
    readdirSync(folder).map((name) => [name, readFileSync(path.join(folder, name), 'utf8')]),
  );
}

const options = { prefix: 'srt-', lineType: 'URBAN' as const };

describe('CSV', () => {
  it('gère les guillemets, les virgules dans un champ, le BOM et les fins de ligne Windows', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","il dit ""bonjour"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'il dit "bonjour"'],
    ]);
    expect(readTable('id,nom\n1, Hiboun \n')).toEqual([{ id: '1', nom: 'Hiboun' }]);
  });
});

describe('gtfsTimeToMinutes', () => {
  it('accepte les heures après minuit (GTFS)', () => {
    expect(gtfsTimeToMinutes('07:30:00')).toBe(450);
    expect(gtfsTimeToMinutes('24:30:00')).toBe(1470);
    expect(gtfsTimeToMinutes('7h30')).toBeNull();
  });
});

describe('buildImportPlan', () => {
  const plan = buildImportPlan(fixture(), options);
  const line = plan.lines[0]!;
  const outbound = line.directions.find((d) => d.direction === 'OUTBOUND')!;
  const inbound = line.directions.find((d) => d.direction === 'INBOUND')!;

  it('importe la ligne, avec son nom arabe et sa couleur', () => {
    expect(line).toMatchObject({
      code: 'G1',
      nameFr: 'Hiboun – Skanes',
      nameAr: 'هيبون – السقانص',
      color: '#FFC52E',
      operatorCode: 'srt-srt',
    });
  });

  it('retient le parcours le plus fréquent, avec des temps de trajet médians', () => {
    expect(outbound.stops).toEqual([
      { stopCode: 'srt-A', minutesFromStart: 0 },
      { stopCode: 'srt-B', minutesFromStart: 9 },
      { stopCode: 'srt-C', minutesFromStart: 20 },
    ]);
    expect(plan.warnings.join(' ')).toContain('1 course(s) avec un autre parcours');
  });

  it('garde les départs, y compris après minuit', () => {
    expect(outbound.departures).toEqual([
      { calendarCode: 'srt-SEM', departureMinutes: 420 },
      { calendarCode: 'srt-SEM', departureMinutes: 480 },
      { calendarCode: 'srt-SEM', departureMinutes: 1470 },
    ]);
    expect(inbound.departures).toEqual([{ calendarCode: 'srt-WE', departureMinutes: 600 }]);
  });

  it('suit la convention « vers … » et reprend le tracé de shapes.txt', () => {
    expect(outbound).toMatchObject({ headsignFr: 'vers Skanes', headsignAr: 'نحو السقانص' });
    expect(outbound.shape).toHaveLength(4);
    expect(inbound.shape).toBeNull();
  });

  it('ignore les gares et les arrêts jamais desservis', () => {
    expect(plan.stops.map((s) => s.code).sort()).toEqual(['srt-A', 'srt-B', 'srt-C']);
    expect(plan.stops.find((s) => s.code === 'srt-B')).toMatchObject({
      nameFr: 'Zone touristique, hôtels',
      nameAr: 'المنطقة السياحية',
    });
  });

  it('refuse un flux incohérent, avec la liste des problèmes', () => {
    const files = fixture();
    files['stop_times.txt'] += 'T1,07:30:00,07:30:00,INCONNU,4\n';
    files['stops.txt'] += 'Z,Paris,48.85,2.35,\n';
    expect(() => buildImportPlan(files, options)).toThrow(GtfsError);
    try {
      buildImportPlan(files, options);
    } catch (error) {
      const problems = (error as GtfsError).problems.join(' ');
      expect(problems).toContain('arrêt inconnu INCONNU');
      expect(problems).toContain('hors de Tunisie');
    }
    const { 'calendar.txt': _removed, ...withoutCalendar } = fixture();
    expect(() => buildImportPlan(withoutCalendar, options)).toThrow(/calendar\.txt/);
  });
});
