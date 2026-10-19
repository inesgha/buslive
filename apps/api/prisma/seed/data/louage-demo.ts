/**
 * ⚠️ DONNÉES DE TEST — À REMPLACER PAR DES DONNÉES VÉRIFIÉES ⚠️
 *
 * - Les VILLES existent, mais l'emplacement des stations de louage est
 *   APPROXIMATIF et doit être vérifié sur place.
 * - Les PRIX, DURÉES et HORAIRES sont des ORDRES DE GRANDEUR inventés : les
 *   tarifs réels des louages sont fixés par l'État et changent régulièrement.
 *
 * Pour corriger : modifier ce fichier puis relancer « pnpm --filter @buslive/api db:seed ».
 */
import { timeToMinutes } from '@buslive/shared';

import type { LocalityData, LouageStationData } from '../types';

/** Destinations hors de la zone de lancement (elles n'ont pas besoin d'un gouvernorat actif). */
export const DEMO_LOUAGE_LOCALITIES: LocalityData[] = [
  { code: 'el-jem', governorateCode: 'TN-53', nameFr: 'El Jem', nameAr: 'الجم' },
  { code: 'chebba', governorateCode: 'TN-53', nameFr: 'Chebba', nameAr: 'الشابة' },
  { code: 'sousse', governorateCode: 'TN-51', nameFr: 'Sousse', nameAr: 'سوسة' },
  { code: 'monastir', governorateCode: 'TN-52', nameFr: 'Monastir', nameAr: 'المنستير' },
  { code: 'moknine', governorateCode: 'TN-52', nameFr: 'Moknine', nameAr: 'المكنين' },
  { code: 'sfax', governorateCode: 'TN-61', nameFr: 'Sfax', nameAr: 'صفاقس' },
  { code: 'tunis', governorateCode: 'TN-11', nameFr: 'Tunis', nameAr: 'تونس' },
];

export const DEMO_LOUAGE_STATIONS: LouageStationData[] = [
  {
    code: 'mahdia-louage',
    localityCode: 'mahdia',
    nameFr: 'Station de louages de Mahdia',
    nameAr: 'محطة اللواج بالمهدية',
    latitude: 35.4969,
    longitude: 11.0459,
    openingMinutes: timeToMinutes('05:00'),
    closingMinutes: timeToMinutes('20:00'),
    // [destination, prix en millimes, durée en minutes]
    routes: [
      ['ksour-essef', 1200, 25],
      ['el-jem', 3000, 45],
      ['monastir', 3500, 50],
      ['moknine', 2500, 35],
      ['sousse', 5500, 75],
      ['sfax', 9000, 110],
      ['tunis', 17000, 210],
    ],
  },
  {
    code: 'ksour-essef-louage',
    localityCode: 'ksour-essef',
    nameFr: 'Station de louages de Ksour Essef',
    nameAr: 'محطة اللواج بقصور الساف',
    latitude: 35.4192,
    longitude: 10.9921,
    openingMinutes: timeToMinutes('05:30'),
    closingMinutes: timeToMinutes('19:00'),
    routes: [
      ['mahdia', 1200, 25],
      ['salakta', 900, 15],
      ['el-jem', 2400, 35],
      ['chebba', 2200, 30],
      ['sousse', 5000, 70],
      ['sfax', 8000, 100],
    ],
  },
];
