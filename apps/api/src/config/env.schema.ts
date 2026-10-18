import { z } from 'zod';

/**
 * Variables d'environnement de l'API, validées au démarrage.
 * Si une variable manque ou est invalide, l'API refuse de démarrer avec un
 * message clair, au lieu d'échouer plus tard sur une requête.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .url()
      .refine((url) => url.startsWith('postgresql://') || url.startsWith('postgres://'), {
        message: 'DATABASE_URL doit être une URL PostgreSQL (postgresql://…).',
      }),
    // « http://a.tn,http://b.tn » → ['http://a.tn', 'http://b.tn']
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),

    // --- Authentification ---
    // Clé de signature des access tokens (HS256). Au moins 32 caractères aléatoires.
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'JWT_ACCESS_SECRET doit contenir au moins 32 caractères (voir .env.example).'),
    // Durée de vie d'un access token, en secondes (15 min par défaut).
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    // Durée de vie d'un refresh token, en jours.
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    // --- Limitation des requêtes (routes marquées @RateLimit, ex. /auth/login) ---
    // Nombre de requêtes autorisées par adresse IP et par fenêtre, et durée de la fenêtre.
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),

    // --- Temps réel ---
    // Délai minimal entre deux diffusions des bus en direct d'une même ligne (ms).
    LIVE_BROADCAST_INTERVAL_MS: z.coerce.number().int().min(10).default(3000),
  })
  .superRefine((env, ctx) => {
    // Garde-fou : la valeur d'exemple ne doit jamais partir en production.
    if (env.NODE_ENV === 'production' && env.JWT_ACCESS_SECRET.includes('change-moi')) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'JWT_ACCESS_SECRET contient encore la valeur d’exemple.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Fonction de validation branchée sur ConfigModule (@nestjs/config).
 * Reçoit les variables brutes (process.env + .env) et renvoie les valeurs typées.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(racine)'} : ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration invalide (apps/api/.env) :\n${details}`);
  }
  return result.data;
}
