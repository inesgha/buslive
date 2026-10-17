// Tests unitaires de l'API : fichiers *.test.ts dans src/, sans base de données.
const base = require('./jest.base.cjs');

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  displayName: 'api',
  roots: ['<rootDir>/src'],
  testRegex: '\\.test\\.ts$',
};
