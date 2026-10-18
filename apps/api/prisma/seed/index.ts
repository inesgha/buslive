// Point d'entrée du seed : « pnpm --filter @buslive/api db:seed » (prisma db seed).
// En production (NODE_ENV=production), seuls les gouvernorats sont insérés :
// jamais les données de démonstration.
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

import { PrismaClient } from '../../src/generated/prisma/client';
import { seed } from './seed';

config({ quiet: true });

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL manquante : crée apps/api/.env (voir .env.example).');
  }

  const demo = process.env.NODE_ENV !== 'production';
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const summary = await seed(prisma, { demo });
    console.log(demo ? 'Seed terminé (avec données de démonstration) :' : 'Seed terminé :');
    console.table(summary);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
