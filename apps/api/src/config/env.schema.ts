import { z } from 'zod';

/**
 * Variables d'environnement de l'API, validées au démarrage.
 * Si une variable manque ou est invalide, l'API refuse de démarrer avec un
 * message clair, au lieu d'échouer plus tard sur une requête.
 */
export const envSchema = z.object({
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
