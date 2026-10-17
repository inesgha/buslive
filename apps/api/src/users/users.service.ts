import type { Locale, UserProfile } from '@buslive/shared';
import { Injectable } from '@nestjs/common';

import type { User } from '../generated/prisma/client';
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
      createdAt: user.createdAt.toISOString(),
    };
  }
}
