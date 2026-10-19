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
  // Couverture (« pnpm test:e2e:coverage ») : mesurée sur les tests e2e, qui
  // passent par les contrôleurs, les services et la base (les tests unitaires
  // ne visent que la logique pure). Mesuré en phase 11 : 90 % des lignes, 73 % des branches.
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/generated/**', '!src/main.ts'],
  coverageThreshold: {
    global: { statements: 85, branches: 70, functions: 85, lines: 85 },
  },
};
