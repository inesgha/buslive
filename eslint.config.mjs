// Configuration ESLint commune à tout le monorepo (format « flat config »).
// Les blocs « files: […] » plus bas ajoutent les règles propres à chaque app.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/android/**',
      '**/ios/**',
      // Code généré par Prisma (prisma generate)
      '**/src/generated/**',
      // Fichier de types généré par Expo
      '**/expo-env.d.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Une variable inutilisée préfixée par « _ » est volontaire.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Impose « import type » pour les imports qui ne servent qu'aux types.
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Fichiers CommonJS (configs Jest…) : require() y est la syntaxe normale.
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // API NestJS : l'injection de dépendances lit les types des paramètres de
    // constructeur à l'exécution (emitDecoratorMetadata). Ces options empêchent
    // ESLint de transformer ces imports en « import type », ce qui casserait l'API.
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      parserOptions: {
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    },
  },
  {
    // App mobile (React Native) : règles des hooks React (ordre des appels,
    // dépendances des useEffect…) et variables globales de React Native et Jest.
    files: ['apps/mobile/**/*.{ts,tsx,cjs}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: { ...globals.jest, __DEV__: 'readonly' },
    },
  },
  {
    // Tableau de bord web (React + Vite) : règles des hooks React et variables
    // globales du navigateur.
    files: ['apps/admin/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  // Toujours en dernier : désactive les règles de style gérées par Prettier.
  prettier,
);
