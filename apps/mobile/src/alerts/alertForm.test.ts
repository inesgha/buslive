import {
  buildAlertInput,
  daysPreset,
  defaultAlertDraft,
  formatWindowTime,
  shiftTime,
  toggleDay,
} from './alertForm';

const ids = {
  lineId: '0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d',
  directionId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  stopId: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
};

describe('defaultAlertDraft', () => {
  it('propose 2 h à partir du quart d’heure en cours, du lundi au samedi', () => {
    const draft = defaultAlertDraft({ isoDate: '2026-10-19', minutes: 7 * 60 + 40 });
    expect(draft).toMatchObject({
      startMinutes: 7 * 60 + 30,
      endMinutes: 9 * 60 + 30,
      days: [1, 2, 3, 4, 5, 6],
      leadMinutes: 10,
    });
  });

  it('reste dans la journée le soir', () => {
    const draft = defaultAlertDraft({ isoDate: '2026-10-19', minutes: 23 * 60 + 10 });
    expect(draft.endMinutes).toBe(1440);
    expect(draft.startMinutes).toBe(22 * 60);
  });
});

describe('shiftTime', () => {
  const draft = defaultAlertDraft({ isoDate: '2026-10-19', minutes: 7 * 60 });

  it('avance par quart d’heure', () => {
    expect(shiftTime(draft, 'startMinutes', 1).startMinutes).toBe(7 * 60 + 15);
    expect(shiftTime(draft, 'endMinutes', -2).endMinutes).toBe(8 * 60 + 30);
  });

  it('garde au moins un quart d’heure entre le début et la fin, dans la journée', () => {
    expect(shiftTime(draft, 'startMinutes', 100).startMinutes).toBe(draft.endMinutes - 15);
    expect(shiftTime(draft, 'endMinutes', -100).endMinutes).toBe(draft.startMinutes + 15);
    expect(shiftTime(draft, 'startMinutes', -100).startMinutes).toBe(0);
    expect(shiftTime(draft, 'endMinutes', 100).endMinutes).toBe(1440);
  });
});

describe('toggleDay / daysPreset', () => {
  it('coche et décoche en gardant l’ordre', () => {
    expect(toggleDay([1, 3], 2)).toEqual([1, 2, 3]);
    expect(toggleDay([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it('reconnaît les choix courants', () => {
    expect(daysPreset([1, 2, 3, 4, 5, 6, 7])).toBe('everyDay');
    expect(daysPreset([5, 4, 3, 2, 1])).toBe('weekdays');
    expect(daysPreset([6, 7])).toBe('weekend');
    expect(daysPreset([1, 3])).toBeNull();
  });
});

describe('buildAlertInput', () => {
  const draft = { ...defaultAlertDraft({ isoDate: '2026-10-19', minutes: 7 * 60 }), ...ids };

  it('construit la requête quand tout est choisi', () => {
    expect(buildAlertInput(draft, ids.stopId)).toMatchObject({ ...ids, leadMinutes: 10 });
  });

  it('renvoie null s’il manque la ligne, l’arrêt ou un jour', () => {
    expect(buildAlertInput({ ...draft, lineId: undefined }, ids.stopId)).toBeNull();
    expect(buildAlertInput(draft, undefined)).toBeNull();
    expect(buildAlertInput({ ...draft, days: [] }, ids.stopId)).toBeNull();
  });

  it('exige au moins un type de notification', () => {
    expect(
      buildAlertInput({ ...draft, notifyApproach: false, notifyIncidents: false }, ids.stopId),
    ).toBeNull();
  });
});

describe('formatWindowTime', () => {
  it('affiche minuit en fin de plage comme « 24:00 »', () => {
    expect(formatWindowTime(450)).toBe('07:30');
    expect(formatWindowTime(1440)).toBe('24:00');
  });
});
