import { defineConfig } from 'tsup';

// Produit deux formats :
// - ESM (.js)  → app mobile (Metro) et admin (Vite)
// - CJS (.cjs) → API NestJS (CommonJS)
// ainsi que les déclarations de types (.d.ts / .d.cts).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
});
