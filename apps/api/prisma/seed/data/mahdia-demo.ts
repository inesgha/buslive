/**
 * ⚠️ DONNÉES DE TEST — À REMPLACER PAR DES DONNÉES VÉRIFIÉES ⚠️
 *
 * - Les LIEUX existent (Mahdia, Rejiche, Ksour Essef, Salakta…), mais les
 *   coordonnées sont APPROXIMATIVES et doivent être vérifiées sur place.
 * - Les NUMÉROS DE LIGNE, les PARCOURS et les HORAIRES sont INVENTÉS.
 *   Ils ne correspondent pas au réseau réel de la SRT de Mahdia.
 * - Les dates du Ramadan 2027 sont approximatives (selon l'observation du croissant).
 *
 * Pour corriger : modifier ce fichier puis relancer « pnpm --filter @buslive/api db:seed ».
 */
import { timeToMinutes } from '@buslive/shared';

import type { CalendarData, LineData, LocalityData, StopData } from '../types';

/** Départs réguliers : every('06:00', '08:00', 30) → 06:00, 06:30, 07:00, 07:30, 08:00. */
function every(from: string, to: string, stepMinutes: number): number[] {
  const result: number[] = [];
  for (let m = timeToMinutes(from); m <= timeToMinutes(to); m += stepMinutes) result.push(m);
  return result;
}

/** Liste explicite : at('06:00', '07:15') → [360, 435]. */
function at(...times: string[]): number[] {
  return times.map(timeToMinutes);
}

export const DEMO_OPERATOR = {
  code: 'DEMO',
  name: 'Opérateur de démonstration (données de test)',
};

export const DEMO_LOCALITIES: LocalityData[] = [
  { code: 'mahdia', governorateCode: 'TN-53', nameFr: 'Mahdia', nameAr: 'المهدية' },
  { code: 'rejiche', governorateCode: 'TN-53', nameFr: 'Rejiche', nameAr: 'رجيش' },
  { code: 'ksour-essef', governorateCode: 'TN-53', nameFr: 'Ksour Essef', nameAr: 'قصور الساف' },
  { code: 'salakta', governorateCode: 'TN-53', nameFr: 'Salakta', nameAr: 'سلقطة' },
];

/** Coordonnées approximatives (à vérifier sur le terrain). */
export const DEMO_STOPS: StopData[] = [
  // Mahdia
  {
    code: 'mahdia-gare-routiere',
    localityCode: 'mahdia',
    nameFr: 'Mahdia – Gare routière',
    nameAr: 'المهدية – المحطة البرية',
    latitude: 35.4978,
    longitude: 11.0473,
  },
  {
    code: 'mahdia-centre-ville',
    localityCode: 'mahdia',
    nameFr: 'Mahdia – Centre-ville',
    nameAr: 'المهدية – وسط المدينة',
    latitude: 35.5036,
    longitude: 11.056,
  },
  {
    code: 'mahdia-skifa-kahla',
    localityCode: 'mahdia',
    nameFr: 'Skifa El Kahla',
    nameAr: 'السقيفة الكحلة',
    latitude: 35.5031,
    longitude: 11.0647,
  },
  {
    code: 'mahdia-cap-afrique',
    localityCode: 'mahdia',
    nameFr: 'Cap Afrique',
    nameAr: 'رأس إفريقيا',
    latitude: 35.4993,
    longitude: 11.0727,
  },
  {
    code: 'mahdia-hopital',
    localityCode: 'mahdia',
    nameFr: 'Hôpital Tahar Sfar',
    nameAr: 'مستشفى الطاهر صفر',
    latitude: 35.5088,
    longitude: 11.0441,
  },
  {
    code: 'mahdia-hiboun',
    localityCode: 'mahdia',
    nameFr: 'Hiboun',
    nameAr: 'هيبون',
    latitude: 35.517,
    longitude: 11.0392,
  },
  {
    code: 'mahdia-zone-touristique',
    localityCode: 'mahdia',
    nameFr: 'Zone touristique',
    nameAr: 'المنطقة السياحية',
    latitude: 35.529,
    longitude: 11.0262,
  },
  {
    code: 'mahdia-sidi-messaoud',
    localityCode: 'mahdia',
    nameFr: 'Sidi Messaoud',
    nameAr: 'سيدي مسعود',
    latitude: 35.5236,
    longitude: 11.0121,
  },
  // Rejiche
  {
    code: 'rejiche-centre',
    localityCode: 'rejiche',
    nameFr: 'Rejiche – Centre',
    nameAr: 'رجيش – المركز',
    latitude: 35.4705,
    longitude: 11.0336,
  },
  // Ksour Essef
  {
    code: 'ksour-essef-station',
    localityCode: 'ksour-essef',
    nameFr: 'Ksour Essef – Station',
    nameAr: 'قصور الساف – المحطة',
    latitude: 35.4207,
    longitude: 10.9889,
  },
  {
    code: 'ksour-essef-centre',
    localityCode: 'ksour-essef',
    nameFr: 'Ksour Essef – Centre',
    nameAr: 'قصور الساف – المركز',
    latitude: 35.4181,
    longitude: 10.9947,
  },
  {
    code: 'ksour-essef-lycee',
    localityCode: 'ksour-essef',
    nameFr: 'Ksour Essef – Lycée',
    nameAr: 'قصور الساف – المعهد الثانوي',
    latitude: 35.4149,
    longitude: 11.0012,
  },
  // Salakta
  {
    code: 'salakta-centre',
    localityCode: 'salakta',
    nameFr: 'Salakta – Centre',
    nameAr: 'سلقطة – المركز',
    latitude: 35.3937,
    longitude: 11.042,
  },
  {
    code: 'salakta-plage',
    localityCode: 'salakta',
    nameFr: 'Salakta – Plage',
    nameAr: 'سلقطة – الشاطئ',
    latitude: 35.3912,
    longitude: 11.0465,
  },
];

export const DEMO_CALENDARS: CalendarData[] = [
  {
    code: 'SEMAINE',
    nameFr: 'Semaine (lundi–vendredi)',
    nameAr: 'أيام الأسبوع (الاثنين–الجمعة)',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    startDate: null,
    endDate: null,
    priority: 0,
  },
  {
    code: 'SAMEDI',
    nameFr: 'Samedi',
    nameAr: 'السبت',
    days: ['saturday'],
    startDate: null,
    endDate: null,
    priority: 0,
  },
  {
    code: 'DIMANCHE',
    nameFr: 'Dimanche',
    nameAr: 'الأحد',
    days: ['sunday'],
    startDate: null,
    endDate: null,
    priority: 0,
  },
  {
    code: 'RAMADAN-2027',
    nameFr: 'Ramadan 2027 (dates approximatives)',
    nameAr: 'رمضان 2027 (تواريخ تقريبية)',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    startDate: '2027-02-08',
    endDate: '2027-03-09',
    // Remplace les horaires normaux pour les lignes qui ont des horaires Ramadan.
    priority: 10,
  },
];

/** Lignes INVENTÉES (numéros, parcours et horaires fictifs). */
export const DEMO_LINES: LineData[] = [
  {
    code: '1',
    nameFr: 'Gare routière – Cap Afrique',
    nameAr: 'المحطة البرية – رأس إفريقيا',
    type: 'URBAN',
    color: '#1D4ED8',
    outbound: {
      headsignFr: 'vers Cap Afrique',
      headsignAr: 'نحو رأس إفريقيا',
      stops: [
        ['mahdia-gare-routiere', 0],
        ['mahdia-centre-ville', 4],
        ['mahdia-skifa-kahla', 8],
        ['mahdia-cap-afrique', 12],
      ],
      departures: {
        SEMAINE: every('06:00', '20:00', 20),
        SAMEDI: every('07:00', '19:00', 30),
        DIMANCHE: every('07:00', '19:00', 60),
        'RAMADAN-2027': [...every('08:00', '17:00', 30), ...every('20:30', '23:30', 60)],
      },
    },
    inbound: {
      headsignFr: 'vers Gare routière',
      headsignAr: 'نحو المحطة البرية',
      departures: {
        SEMAINE: every('06:10', '20:10', 20),
        SAMEDI: every('07:15', '19:15', 30),
        DIMANCHE: every('07:20', '19:20', 60),
        'RAMADAN-2027': [...every('08:15', '17:15', 30), ...every('20:45', '23:45', 60)],
      },
    },
  },
  {
    code: '2',
    nameFr: 'Gare routière – Sidi Messaoud',
    nameAr: 'المحطة البرية – سيدي مسعود',
    type: 'URBAN',
    color: '#7C3AED',
    outbound: {
      headsignFr: 'vers Sidi Messaoud',
      headsignAr: 'نحو سيدي مسعود',
      stops: [
        ['mahdia-gare-routiere', 0],
        ['mahdia-hopital', 5],
        ['mahdia-hiboun', 10],
        ['mahdia-zone-touristique', 16],
        ['mahdia-sidi-messaoud', 22],
      ],
      departures: {
        SEMAINE: every('06:30', '19:30', 30),
        SAMEDI: every('07:00', '19:00', 60),
        // Pas de service le dimanche.
        'RAMADAN-2027': every('08:00', '16:15', 45),
      },
    },
    inbound: {
      headsignFr: 'vers Gare routière',
      headsignAr: 'نحو المحطة البرية',
      departures: {
        SEMAINE: every('07:00', '20:00', 30),
        SAMEDI: every('07:30', '19:30', 60),
        'RAMADAN-2027': every('08:30', '16:45', 45),
      },
    },
  },
  {
    code: '10',
    nameFr: 'Mahdia – Ksour Essef',
    nameAr: 'المهدية – قصور الساف',
    type: 'SUBURBAN',
    color: '#0E7490',
    outbound: {
      headsignFr: 'vers Ksour Essef',
      headsignAr: 'نحو قصور الساف',
      stops: [
        ['mahdia-gare-routiere', 0],
        ['rejiche-centre', 12],
        ['ksour-essef-station', 27],
        ['ksour-essef-centre', 30],
        ['ksour-essef-lycee', 34],
      ],
      departures: {
        SEMAINE: at(
          '06:00',
          '07:00',
          '08:30',
          '10:00',
          '12:00',
          '13:30',
          '15:00',
          '17:00',
          '18:30',
        ),
        SAMEDI: at('07:00', '09:00', '12:00', '15:00', '18:00'),
        DIMANCHE: at('08:00', '12:00', '17:00'),
        'RAMADAN-2027': at('07:30', '09:30', '11:30', '13:30', '15:30'),
      },
    },
    inbound: {
      headsignFr: 'vers Mahdia',
      headsignAr: 'نحو المهدية',
      departures: {
        SEMAINE: at(
          '06:30',
          '07:30',
          '09:15',
          '11:00',
          '12:45',
          '14:15',
          '16:00',
          '17:45',
          '19:15',
        ),
        SAMEDI: at('07:45', '10:00', '13:00', '16:00', '19:00'),
        DIMANCHE: at('09:00', '13:00', '18:00'),
        'RAMADAN-2027': at('08:30', '10:30', '12:30', '14:30', '16:30'),
      },
    },
  },
  {
    code: '11',
    nameFr: 'Ksour Essef – Salakta',
    nameAr: 'قصور الساف – سلقطة',
    type: 'SUBURBAN',
    color: '#BE185D',
    outbound: {
      headsignFr: 'vers Salakta',
      headsignAr: 'نحو سلقطة',
      stops: [
        ['ksour-essef-centre', 0],
        ['salakta-centre', 10],
        ['salakta-plage', 13],
      ],
      // Pas d'horaires Ramadan : pendant le Ramadan, les horaires normaux s'appliquent.
      departures: {
        SEMAINE: at('07:00', '09:00', '12:00', '15:00', '17:30'),
        SAMEDI: at('08:00', '12:00', '16:00'),
      },
    },
    inbound: {
      headsignFr: 'vers Ksour Essef',
      headsignAr: 'نحو قصور الساف',
      departures: {
        SEMAINE: at('07:30', '09:30', '12:30', '15:30', '18:00'),
        SAMEDI: at('08:30', '12:30', '16:30'),
      },
    },
  },
];
