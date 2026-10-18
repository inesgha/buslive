import { z } from 'zod';

import { LocaleSchema } from './i18n';
import { UserProfileSchema } from './user';

/** Longueurs du mot de passe (recommandations NIST : longueur, pas de complexité imposée). */
export const PASSWORD_MIN_LENGTH = 8;
/** Limite haute : un mot de passe géant ralentirait volontairement le hachage (déni de service). */
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Email nettoyé (espaces retirés, minuscules) PUIS validé.
 * L'ordre compte : « z.email().trim() » validerait avant de nettoyer.
 */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Adresse email invalide.'))
  .meta({ format: 'email', example: 'ines@example.tn' });

export const PasswordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`,
  )
  .max(
    PASSWORD_MAX_LENGTH,
    `Le mot de passe ne doit pas dépasser ${PASSWORD_MAX_LENGTH} caractères.`,
  );

export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 50;

/**
 * Caractère de remplacement Unicode (U+FFFD). Il apparaît quand un texte mal
 * encodé (pas en UTF-8) est décodé : on refuse plutôt que d'enregistrer un nom abîmé.
 */
export const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(
    DISPLAY_NAME_MIN_LENGTH,
    `Le nom doit contenir au moins ${DISPLAY_NAME_MIN_LENGTH} caractères.`,
  )
  .max(
    DISPLAY_NAME_MAX_LENGTH,
    `Le nom ne doit pas dépasser ${DISPLAY_NAME_MAX_LENGTH} caractères.`,
  )
  .refine(
    (name) => !name.includes(REPLACEMENT_CHARACTER),
    'Le nom contient des caractères invalides.',
  );

/**
 * Corps de POST /auth/register.
 * Les champs inconnus (ex. « role ») sont ignorés : impossible de s'inscrire ADMIN.
 */
export const RegisterSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  displayName: DisplayNameSchema,
  locale: LocaleSchema.default('fr'),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

/**
 * Corps de POST /auth/login. Pas de longueur minimale ici : les règles peuvent
 * évoluer, un ancien mot de passe valide doit toujours permettre la connexion.
 */
export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof LoginSchema>;

/** Corps de POST /auth/refresh et POST /auth/logout. */
export const RefreshTokenInputSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});
export type RefreshTokenInput = z.infer<typeof RefreshTokenInputSchema>;

export const AuthTokensSchema = z.object({
  /** JWT à envoyer dans l'en-tête « Authorization: Bearer … ». */
  accessToken: z.string(),
  /** Durée de validité de l'access token, en secondes. */
  accessTokenExpiresIn: z.number().int().positive(),
  /** Jeton opaque à conserver de façon sécurisée (expo-secure-store côté mobile). */
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.iso.datetime(),
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

/** Réponse de /auth/register, /auth/login et /auth/refresh. */
export const AuthResponseSchema = z.object({
  user: UserProfileSchema,
  tokens: AuthTokensSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
