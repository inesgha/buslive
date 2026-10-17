// Tests de bout en bout : fichiers *.e2e-test.ts dans test/.
// Ils utilisent une base séparée « <nom>_test » (voir test/test-env.cjs),
// créée et migrée automatiquement. Prérequis : pnpm db:up et apps/api/.env.
const base = require('./jest.base.cjs');

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  displayName: 'api-e2e',
  roots: ['<rootDir>/test'],
  testRegex: '\\.e2e-test\\.ts$',
  globalSetup: '<rootDir>/test/global-setup.cjs',
  setupFiles: ['<rootDir>/test/setup-env.cjs'],
  // Un fichier à la fois : les tests partagent la même base et la vident.
  maxWorkers: 1,
  testTimeout: 15000,
};
