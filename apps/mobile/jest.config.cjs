// Tests de l'app mobile : preset jest-expo (Babel + simulations des modules natifs Expo).

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.cjs'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  // Alias « @/… » du tsconfig.
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  // Paquets React Native / Expo publiés non compilés : Babel doit les transformer.
  // Avec pnpm, ils se trouvent sous node_modules/.pnpm/<paquet>/node_modules/.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?(?:(?:jest-)?react-native|@react-native(?:-community)?|expo(?:nent)?|@expo(?:nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@buslive/.*))',
  ],
};
