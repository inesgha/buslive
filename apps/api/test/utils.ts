import 'reflect-metadata';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * Démarre l'application complète, configurée comme en production (setupApp).
 * « customize » permet de remplacer un provider pour un test précis.
 */
export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<TestApp> {
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/** Vide les tables. Refuse de s'exécuter ailleurs que sur une base « _test ». */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const [row] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (!row?.db.endsWith('_test')) {
    throw new Error(`Refus de vider la base « ${row?.db} » : ce n'est pas une base de test.`);
  }
  await prisma.$executeRaw`TRUNCATE TABLE refresh_tokens, users CASCADE`;
}
