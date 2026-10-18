import type { GovernorateData } from '../types';

/**
 * Les 24 gouvernorats de Tunisie (codes ISO 3166-2:TN, noms officiels).
 * Données réelles. Seul Mahdia est activé au lancement.
 */
export const GOVERNORATES: GovernorateData[] = [
  { code: 'TN-11', nameFr: 'Tunis', nameAr: 'تونس', isActive: false },
  { code: 'TN-12', nameFr: 'Ariana', nameAr: 'أريانة', isActive: false },
  { code: 'TN-13', nameFr: 'Ben Arous', nameAr: 'بن عروس', isActive: false },
  { code: 'TN-14', nameFr: 'La Manouba', nameAr: 'منوبة', isActive: false },
  { code: 'TN-21', nameFr: 'Nabeul', nameAr: 'نابل', isActive: false },
  { code: 'TN-22', nameFr: 'Zaghouan', nameAr: 'زغوان', isActive: false },
  { code: 'TN-23', nameFr: 'Bizerte', nameAr: 'بنزرت', isActive: false },
  { code: 'TN-31', nameFr: 'Béja', nameAr: 'باجة', isActive: false },
  { code: 'TN-32', nameFr: 'Jendouba', nameAr: 'جندوبة', isActive: false },
  { code: 'TN-33', nameFr: 'Le Kef', nameAr: 'الكاف', isActive: false },
  { code: 'TN-34', nameFr: 'Siliana', nameAr: 'سليانة', isActive: false },
  { code: 'TN-41', nameFr: 'Kairouan', nameAr: 'القيروان', isActive: false },
  { code: 'TN-42', nameFr: 'Kasserine', nameAr: 'القصرين', isActive: false },
  { code: 'TN-43', nameFr: 'Sidi Bouzid', nameAr: 'سيدي بوزيد', isActive: false },
  { code: 'TN-51', nameFr: 'Sousse', nameAr: 'سوسة', isActive: false },
  { code: 'TN-52', nameFr: 'Monastir', nameAr: 'المنستير', isActive: false },
  { code: 'TN-53', nameFr: 'Mahdia', nameAr: 'المهدية', isActive: true },
  { code: 'TN-61', nameFr: 'Sfax', nameAr: 'صفاقس', isActive: false },
  { code: 'TN-71', nameFr: 'Gafsa', nameAr: 'قفصة', isActive: false },
  { code: 'TN-72', nameFr: 'Tozeur', nameAr: 'توزر', isActive: false },
  { code: 'TN-73', nameFr: 'Kébili', nameAr: 'قبلي', isActive: false },
  { code: 'TN-81', nameFr: 'Gabès', nameAr: 'قابس', isActive: false },
  { code: 'TN-82', nameFr: 'Médenine', nameAr: 'مدنين', isActive: false },
  { code: 'TN-83', nameFr: 'Tataouine', nameAr: 'تطاوين', isActive: false },
];
