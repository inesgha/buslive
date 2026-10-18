import { addDays, minutesUntil, tunisClock } from './clock';
import { upcomingPassages } from './passages';
import { type CalendarRule, minutesToTime, timeToMinutes } from './schedule';

const allDays = {
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: true,
  sunday: true,
};

const weekdays: CalendarRule = {
  ...allDays,
  saturday: false,
  sunday: false,
  code: 'SEMAINE',
  startDate: null,
  endDate: null,
  priority: 0,
};

const ramadan: CalendarRule = {
  ...allDays,
  code: 'RAMADAN',
  startDate: '2027-02-08',
  endDate: '2027-03-09',
  priority: 10,
};

const at = (time: string) => timeToMinutes(time);
const show = (passages: { passingMinutes: number }[]) =>
  passages.map((p) => minutesToTime(p.passingMinutes));

describe('tunisClock', () => {
  it('convertit un instant UTC en heure de Tunis (UTC+1, sans heure d’été)', () => {
    expect(tunisClock(new Date('2026-10-19T06:50:00Z'))).toEqual({
      isoDate: '2026-10-19',
      minutes: at('07:50'),
    });
    // En juillet aussi UTC+1 : la Tunisie n'a plus d'heure d'été.
    expect(tunisClock(new Date('2026-07-15T12:00:00Z')).minutes).toBe(at('13:00'));
  });

  it('change de jour à minuit heure de Tunis, pas à minuit UTC', () => {
    expect(tunisClock(new Date('2026-10-19T23:30:00Z'))).toEqual({
      isoDate: '2026-10-20',
      minutes: at('00:30'),
    });
  });
});

describe('addDays / minutesUntil', () => {
  it('gère les fins de mois', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('compte les minutes jusqu’à un passage, même le lendemain', () => {
    const clock = { isoDate: '2026-10-19', minutes: at('23:50') };
    expect(minutesUntil({ serviceDate: '2026-10-20', passingMinutes: at('00:10') }, clock)).toBe(
      20,
    );
  });
});

describe('upcomingPassages', () => {
  // Ligne fictive : départs du terminus à 06:00, 07:00, 08:00 ; arrêt à 25 min.
  const line = {
    key: 'L10-aller',
    minutesFromStart: 25,
    departures: [
      { calendarCode: 'SEMAINE', departureMinutes: at('06:00') },
      { calendarCode: 'SEMAINE', departureMinutes: at('07:00') },
      { calendarCode: 'SEMAINE', departureMinutes: at('08:00') },
      { calendarCode: 'RAMADAN', departureMinutes: at('09:00') },
    ],
  };

  it('renvoie les passages à venir, à l’heure de l’arrêt (départ + trajet)', () => {
    const clock = { isoDate: '2026-10-19', minutes: at('07:00') }; // lundi
    expect(show(upcomingPassages([line], [weekdays, ramadan], clock))).toEqual([
      '07:25',
      '08:25',
      '06:25',
    ]);
  });

  it('inclut le lendemain dans la fenêtre de 24 h, avec la bonne date de service', () => {
    const clock = { isoDate: '2026-10-19', minutes: at('09:00') };
    const passages = upcomingPassages([line], [weekdays, ramadan], clock);
    expect(passages[0]).toEqual({
      key: 'L10-aller',
      serviceDate: '2026-10-20',
      passingMinutes: at('06:25'),
    });
  });

  it('ne propose rien le week-end pour une ligne de semaine (dans la fenêtre)', () => {
    const clock = { isoDate: '2026-10-17', minutes: at('08:00') }; // samedi
    expect(upcomingPassages([line], [weekdays], clock, { horizonMinutes: 12 * 60 })).toEqual([]);
  });

  it('pendant le Ramadan, applique les horaires Ramadan', () => {
    const clock = { isoDate: '2027-02-15', minutes: at('06:00') };
    expect(
      show(upcomingPassages([line], [weekdays, ramadan], clock, { horizonMinutes: 6 * 60 })),
    ).toEqual(['09:25']);
  });

  it('rattache un bus après minuit à la journée de la veille', () => {
    const night = {
      key: 'nuit',
      minutesFromStart: 10,
      departures: [{ calendarCode: 'SEMAINE', departureMinutes: at('24:20') }], // 00:20 la nuit de lundi à mardi
    };
    const clock = { isoDate: '2026-10-20', minutes: at('00:15') }; // mardi 00:15
    const [passage] = upcomingPassages([night], [weekdays], clock, { horizonMinutes: 60 });
    expect(passage).toEqual({
      key: 'nuit',
      serviceDate: '2026-10-19',
      passingMinutes: at('24:30'),
    });
    expect(minutesUntil(passage!, clock)).toBe(15);
  });

  it('mélange plusieurs lignes dans l’ordre chronologique et respecte la limite', () => {
    const other = {
      key: 'L1',
      minutesFromStart: 0,
      departures: [{ calendarCode: 'SEMAINE', departureMinutes: at('07:10') }],
    };
    const clock = { isoDate: '2026-10-19', minutes: at('07:00') };
    const passages = upcomingPassages([line, other], [weekdays], clock, { limit: 2 });
    expect(passages.map((p) => `${p.key} ${minutesToTime(p.passingMinutes)}`)).toEqual([
      'L1 07:10',
      'L10-aller 07:25',
    ]);
  });
});
