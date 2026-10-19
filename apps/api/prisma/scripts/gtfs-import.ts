// Import d'un réseau au format GTFS :
//   pnpm --filter @buslive/api gtfs:import <dossier> --governorate TN-53 [--prefix srt-] [--line-type URBAN] [--apply]
//
// Sans --apply : essai à blanc (vérifie tout, affiche ce qui serait créé ou mis
// à jour, n'écrit RIEN). Avec --apply : tout est écrit en une transaction.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { LineTypeSchema } from '@buslive/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

import { PrismaClient } from '../../src/generated/prisma/client';
import { applyImportPlan } from '../../src/gtfs/gtfs-apply';
import { buildImportPlan, GtfsError } from '../../src/gtfs/gtfs-plan';

config({ quiet: true });

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const folder = args[0];
  const governorateCode = option(args, 'governorate');
  const lineType = LineTypeSchema.safeParse(option(args, 'line-type') ?? 'URBAN');
  if (!folder || folder.startsWith('--') || !governorateCode || !lineType.success) {
    throw new Error(
      'Usage : gtfs:import <dossier> --governorate TN-53 [--prefix srt-] [--line-type URBAN|SUBURBAN|INTERCITY] [--apply]',
    );
  }
  const files = Object.fromEntries(
    readdirSync(folder)
      .filter((name) => name.endsWith('.txt'))
      .map((name) => [name, readFileSync(path.join(folder, name), 'utf8')]),
  );
  const plan = buildImportPlan(files, {
    prefix: option(args, 'prefix') ?? '',
    lineType: lineType.data,
  });
  for (const warning of plan.warnings) console.warn(`⚠ ${warning}`);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL manquante (apps/api/.env).');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const dryRun = !args.includes('--apply');
    const summary = await applyImportPlan(prisma, plan, { governorateCode, dryRun });
    console.log(dryRun ? 'ESSAI À BLANC (rien n’a été écrit) :' : 'IMPORT TERMINÉ :');
    const row = (counts: { created: number; updated: number }) => ({
      créés: counts.created,
      'mis à jour': counts.updated,
    });
    console.table({
      arrêts: row(summary.stops),
      calendriers: row(summary.calendars),
      lignes: row(summary.lines),
    });
    console.log(`Exploitants : ${summary.operators} · départs : ${summary.departures}`);
    if (dryRun) console.log('Pour importer pour de bon, relancer avec --apply.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof GtfsError || error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
