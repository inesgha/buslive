// Configuration du CLI Prisma (migrate, generate, studio…).
// Prisma 7 ne lit plus le .env tout seul : on le charge explicitement.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // process.env plutôt que env('DATABASE_URL') : env() échoue si la variable
    // manque, ce qui casserait « prisma generate » (lancé par « pnpm install »)
    // sur un clone neuf ou en CI. Les commandes qui touchent la base
    // (migrate, studio…) signalent elles-mêmes l'absence d'URL.
    url: process.env.DATABASE_URL,
  },
});
