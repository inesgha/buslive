import { buildReportInput, passageChoices, stepsFor } from './reportForm';

const ids = {
  lineId: '0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d',
  directionId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  stopId: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
};

describe('stepsFor', () => {
  it('demande l’arrêt et le bus pour « pas venu », la ligne seulement pour « plein »', () => {
    expect(stepsFor('NOT_CAME')).toEqual(['type', 'line', 'stop', 'passage']);
    expect(stepsFor('DELAYED')).toContain('delay');
    expect(stepsFor('FULL')).toEqual(['type', 'line']);
  });
});

describe('buildReportInput', () => {
  it('construit un « pas venu » avec l’horaire choisi', () => {
    expect(
      buildReportInput({
        type: 'NOT_CAME',
        ...ids,
        passage: { serviceDate: '2026-10-19', passingMinutes: 450 },
      }),
    ).toEqual({ type: 'NOT_CAME', ...ids, serviceDate: '2026-10-19', scheduledMinutes: 450 });
  });

  it('accepte « je ne sais pas » pour l’horaire', () => {
    expect(buildReportInput({ type: 'NOT_CAME', ...ids, passage: null })).toEqual({
      type: 'NOT_CAME',
      ...ids,
    });
  });

  it('renvoie null tant que l’arrêt manque', () => {
    expect(
      buildReportInput({ type: 'NOT_CAME', lineId: ids.lineId, directionId: ids.directionId }),
    ).toBeNull();
  });

  it('n’envoie pas l’arrêt pour « plein » (inutile)', () => {
    expect(buildReportInput({ type: 'FULL', ...ids })).toEqual({
      type: 'FULL',
      lineId: ids.lineId,
      directionId: ids.directionId,
    });
  });

  it('exige la position pour « arrêt déplacé » et retire le sens', () => {
    expect(buildReportInput({ type: 'STOP_MOVED', ...ids })).toBeNull();
    const position = { latitude: 35.5, longitude: 11.06, accuracy: 8 };
    expect(buildReportInput({ type: 'STOP_MOVED', ...ids }, position)).toEqual({
      type: 'STOP_MOVED',
      lineId: ids.lineId,
      stopId: ids.stopId,
      position,
    });
  });
});

describe('passageChoices', () => {
  const direction = {
    stops: [
      {
        sequence: 1,
        minutesFromStart: 0,
        stop: {
          id: 'terminus',
          code: 't',
          nameFr: 'T',
          nameAr: 'ت',
          latitude: 0,
          longitude: 0,
          locality: null,
        },
      },
      {
        sequence: 2,
        minutesFromStart: 20,
        stop: {
          id: ids.stopId,
          code: 'a',
          nameFr: 'A',
          nameAr: 'أ',
          latitude: 0,
          longitude: 0,
          locality: null,
        },
      },
    ],
    departures: [6, 7, 8, 9, 10].map((h) => ({ calendarCode: 'TOUS', departureMinutes: h * 60 })),
  };
  const everyDay = {
    code: 'TOUS',
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
    sunday: true,
    startDate: null,
    endDate: null,
    priority: 0,
  };

  it('propose les bus de 60 min avant à 30 min après, à l’heure de l’arrêt', () => {
    // 07:50 à Tunis = 06:50 UTC.
    const now = new Date('2026-10-19T06:50:00Z');
    const choices = passageChoices(direction, [everyDay], ids.stopId, now);
    expect(choices.map((c) => c.passingMinutes)).toEqual([7 * 60 + 20, 8 * 60 + 20]);
  });
});
