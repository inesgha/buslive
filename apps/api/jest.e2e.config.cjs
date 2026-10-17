// Tests de bout en bout : fichiers *.e2e-test.ts dans test/.
// Ils utilisent la vraie base Docker (pnpm db:up) et apps/api/.env.
const base = require('./jest.base.cjs');

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  displayName: 'api-e2e',
  roots: ['<rootDir>/test'],
  testRegex: '\\.e2e-test\\.ts$',
  testTimeout: 15000,
};
