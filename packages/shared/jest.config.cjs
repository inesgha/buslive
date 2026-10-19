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
  // Couverture (« pnpm test:coverage ») : le test échoue sous ces seuils.
  // Mesuré en phase 11 : 90 % des lignes, 85 % des branches.
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts'],
  coverageThreshold: {
    global: { statements: 85, branches: 80, functions: 90, lines: 85 },
  },
};
