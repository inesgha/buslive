// Environnement des tests e2e : même serveur et mêmes identifiants que
// apps/api/.env, mais une base séparée « <nom>_test », pour ne jamais toucher
// aux données de développement.
const path = require('node:path');

const dotenv = require('dotenv');

/** Applique l'environnement de test à process.env et renvoie l'URL de la base de test. */
function applyTestEnv() {
  // Ne remplace pas les variables déjà définies (ex. en CI).
  dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

  const sourceUrl = process.env.DATABASE_URL;
  if (!sourceUrl) {
    throw new Error('DATABASE_URL manquante : crée apps/api/.env (voir .env.example).');
  }

  const url = new URL(sourceUrl);
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith('_test')) url.pathname = `/${dbName}_test`;

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = url.toString();
  // Limite de tentatives élevée par défaut : le test dédié à la limitation
  // fixe sa propre limite (voir auth.e2e-test.ts).
  process.env.RATE_LIMIT_MAX = '1000';
  // Diffusion des bus en direct quasi immédiate : les tests n'attendent pas 3 s.
  process.env.LIVE_BROADCAST_INTERVAL_MS = '50';
  // Notifications gardées en mémoire : les tests vérifient ce qui serait parti.
  process.env.PUSH_PROVIDER = 'memory';
  // Origine du tableau de bord web (cookies de session, vérification de l'origine).
  process.env.CORS_ORIGINS = 'http://localhost:5173';
  // Pas de ligne de journal par requête (le test dédié l'active lui-même).
  process.env.LOG_REQUESTS = process.env.LOG_REQUESTS_IN_TESTS ?? 'false';
  return url;
}

module.exports = { applyTestEnv };
