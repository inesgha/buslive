import { z } from 'zod';

import { LocaleSchema } from './i18n';

/**
 * Rôles, du moins au plus privilégié. L'ordre compte : un rôle inclut les
 * droits des rôles placés avant lui (un ADMIN peut tout ce que fait un MODERATOR).
 * Doit rester identique à l'enum « Role » du schéma Prisma (vérifié par un test de l'API).
 */
export const ROLES = ['USER', 'MODERATOR', 'ADMIN'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

/** Indique si « role » vaut au moins « minRole » dans la hiérarchie. */
export function hasMinRole(role: Role, minRole: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(minRole);
}

/**
 * Numéro de téléphone tunisien, normalisé au format international « +216XXXXXXXX ».
 * Accepte « 22 123 456 », « 0021622123456 », « +216 22-123-456 »…
 * Prévu pour une future connexion par SMS : pas encore utilisé à l'inscription.
 */
export const TunisianPhoneSchema = z
  .string()
  .transform((value) => value.replace(/[\s.-]/g, ''))
  .transform((value) => {
    if (value.startsWith('00216')) return `+216${value.slice(5)}`;
    if (/^\d{8}$/.test(value)) return `+216${value}`;
    return value;
  })
  .pipe(z.string().regex(/^\+216[2-9]\d{7}$/, 'Numéro de téléphone tunisien invalide.'));

/** Profil public d'un utilisateur, tel que renvoyé par l'API. */
export const UserProfileSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  role: RoleSchema,
  locale: LocaleSchema,
  phone: z.string().nullable(),
  /**
   * Recevoir une notification quand mes signalements sont confirmés ou démentis.
   * Valeur par défaut : un profil gardé en cache avant la phase 8 reste lisible.
   */
  notifyReportOutcome: z.boolean().default(true),
  createdAt: z.iso.datetime(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

/**
 * Corps de PATCH /me. La langue sert aux notifications push : elles sont
 * rédigées côté serveur, dans la langue du compte.
 */
export const UpdateProfileSchema = z
  .object({
    locale: LocaleSchema.optional(),
    notifyReportOutcome: z.boolean().optional(),
    /**
     * Téléphone (+216…), exigé pour le covoiturage : il n'est montré qu'à la
     * personne dont on a accepté (ou qui a accepté) la demande. null = le retirer.
     */
    phone: TunisianPhoneSchema.nullable().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Rien à modifier.',
  });
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
