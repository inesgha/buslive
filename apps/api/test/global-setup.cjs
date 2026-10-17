// Exécuté UNE fois avant tous les tests e2e : crée la base de test si besoin,
// puis applique les migrations Prisma.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const { Client } = require('pg');

const { applyTestEnv } = require('./test-env.cjs');

module.exports = async function globalSetup() {
  const url = applyTestEnv();
  const dbName = url.pathname.slice(1);

  // Garde-fou : nom de base simple et suffixé « _test » (il est inséré dans du SQL).
  if (!/^[a-z0-9_]+_test$/.test(dbName)) {
    throw new Error(`Nom de base de test inattendu : « ${dbName} ».`);
  }

  // Connexion à la base d'administration « postgres » pour créer la base de test.
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      dbName,
    ]);
    if (!rowCount) await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }

  // Applique les migrations (extensions PostGIS comprises) sur la base de test.
  const apiDir = path.join(__dirname, '..');
  execFileSync(
    process.execPath,
    [path.join(apiDir, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'],
    { cwd: apiDir, env: process.env, stdio: 'pipe' },
  );
};
