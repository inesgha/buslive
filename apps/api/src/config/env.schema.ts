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

    // --- Notifications push ---
    // fcm : envoi réel par Firebase Cloud Messaging ;
    // log : la notification est seulement écrite dans la console (développement, sans Firebase) ;
    // memory : gardée en mémoire (tests automatiques).
    PUSH_PROVIDER: z.enum(['fcm', 'log', 'memory']).default('log'),
    // Chemin du fichier JSON de la clé du compte de service Firebase (secret, jamais versionné).
    // Nom standard des bibliothèques Google : les hébergeurs savent le fournir.
    GOOGLE_APPLICATION_CREDENTIALS: z.string().trim().min(1).optional(),

    // --- Production (phase 11) ---
    // text : lisible en développement ; json : une ligne JSON par événement (production).
    LOG_FORMAT: z.enum(['text', 'json']).default('text'),
    // Une ligne de journal par requête (sans données personnelles).
    LOG_REQUESTS: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    // Nombre de proxys devant l'API (Caddy = 1). Sans cela, toutes les requêtes
    // sembleraient venir du proxy, et la limitation par IP bloquerait tout le monde.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    // Adresse affichée dans la politique de confidentialité (droits des personnes).
    CONTACT_EMAIL: z.email().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.PUSH_PROVIDER === 'fcm' && !env.GOOGLE_APPLICATION_CREDENTIALS) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_APPLICATION_CREDENTIALS'],
        message: 'Obligatoire avec PUSH_PROVIDER=fcm (chemin de la clé du compte de service).',
      });
    }
    if (env.NODE_ENV === 'production' && env.PUSH_PROVIDER === 'memory') {
      ctx.addIssue({
        code: 'custom',
        path: ['PUSH_PROVIDER'],
        message: 'PUSH_PROVIDER=memory est réservé aux tests.',
      });
    }
    // En production, l'admin web n'est servi qu'en HTTPS (cookie de session « Secure »).
    if (env.NODE_ENV === 'production' && env.CORS_ORIGINS.some((o) => !o.startsWith('https://'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'En production, les origines autorisées doivent être en https://.',
      });
    }
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
 * Réglages acceptés mais déconseillés en production : affichés au démarrage
 * (l'API démarre quand même, par exemple avant que Firebase soit configuré).
 */
export type ProductionSettings = Pick<
  Env,
  'NODE_ENV' | 'PUSH_PROVIDER' | 'TRUST_PROXY' | 'LOG_FORMAT' | 'CONTACT_EMAIL'
>;

export function productionWarnings(env: ProductionSettings): string[] {
  if (env.NODE_ENV !== 'production') return [];
  return [
    ...(env.PUSH_PROVIDER !== 'fcm'
      ? ['PUSH_PROVIDER n’est pas « fcm » : aucune notification push ne sera envoyée.']
      : []),
    ...(env.TRUST_PROXY === 0
      ? ['TRUST_PROXY=0 : derrière Caddy, mettre 1 (sinon la limitation par IP vise le proxy).']
      : []),
    ...(env.LOG_FORMAT !== 'json' ? ['LOG_FORMAT n’est pas « json ».'] : []),
    ...(!env.CONTACT_EMAIL
      ? ['CONTACT_EMAIL absent : la politique de confidentialité n’indique pas de contact.']
      : []),
  ];
}

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
