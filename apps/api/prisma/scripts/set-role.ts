// Donne un rôle à un compte existant, en ligne de commande :
//   pnpm --filter @buslive/api user:role <email> <USER|MODERATOR|ADMIN>
//
// Indispensable pour le PREMIER administrateur : sans lui, personne ne peut
// nommer de modérateurs depuis le tableau de bord. Ensuite, utiliser l'admin
// (les changements y sont écrits au journal de modération).
import { EmailSchema, RoleSchema } from '@buslive/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

import { PrismaClient } from '../../src/generated/prisma/client';

config({ quiet: true });

async function main(): Promise<void> {
  const [rawEmail, rawRole] = process.argv.slice(2);
  const email = EmailSchema.safeParse(rawEmail);
  const role = RoleSchema.safeParse(rawRole);
  if (!email.success || !role.success) {
    throw new Error('Usage : pnpm --filter @buslive/api user:role <email> <USER|MODERATOR|ADMIN>');
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL manquante (apps/api/.env).');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const user = await prisma.user.findUnique({ where: { email: email.data } });
    if (!user)
      throw new Error(`Aucun compte avec l’email ${email.data} : inscris-toi d’abord dans l’app.`);
    await prisma.user.update({ where: { id: user.id }, data: { role: role.data } });
    // Le rôle est inscrit dans l'access token : on force une reconnexion.
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    console.log(`${email.data} : ${user.role} → ${role.data} (reconnexion nécessaire).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
