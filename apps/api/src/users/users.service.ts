import type { Locale, UpdateProfileInput, UserProfile } from '@buslive/shared';
import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma, type User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  displayName: string;
  locale: Locale;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** L'email doit déjà être normalisé (EmailSchema le fait). */
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: CreateUserData): Promise<User> {
    return this.prisma.user.create({ data });
  }

  /** Modifie les préférences du compte (langue, notifications). */
  async update(id: string, input: UpdateProfileInput): Promise<UserProfile> {
    try {
      return this.toProfile(await this.prisma.user.update({ where: { id }, data: input }));
    } catch (error) {
      // P2025 : le compte a été supprimé entre-temps (jeton encore valide).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Compte introuvable.');
      }
      throw error;
    }
  }

  /**
   * Profil renvoyé au client : on choisit explicitement les champs, pour ne
   * jamais exposer passwordHash par accident.
   */
  toProfile(user: User): UserProfile {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      locale: user.locale,
      phone: user.phone,
      notifyReportOutcome: user.notifyReportOutcome,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
