// Configuration Jest du package partagé.
// Fichier en CommonJS (.cjs) : Jest le lit directement, sans outil supplémentaire.

/** @type {import('jest').Config} */
module.exports = {
  displayName: 'shared',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  transform: {
    // ts-jest compile le TypeScript des tests à la volée.
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};
