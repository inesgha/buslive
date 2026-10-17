// Configuration Jest commune aux tests unitaires et e2e de l'API.
//
// Pourquoi le mode ESM ? NestJS 12 est publié uniquement en ESM. Sous Node 22,
// Jest ne peut pas charger un paquet ESM depuis un test CommonJS (il faudrait
// Node ≥ 24.9). Les tests sont donc exécutés comme des modules ESM :
//   - lancement avec « node --experimental-vm-modules » (voir package.json) ;
//   - dans un test, la fonction « jest » s'importe : import { jest } from '@jest/globals'.

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Les fichiers .ts sont traités comme des modules ESM.
  extensionsToTreatAsEsm: ['.ts'],
  // Le client Prisma généré importe « ./fichier.js » alors que la source est
  // « ./fichier.ts » : on retire l'extension pour que Jest trouve le .ts.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
};
