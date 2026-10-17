import type { Role } from '@buslive/shared';
import { SetMetadata } from '@nestjs/common';

export const MIN_ROLE_KEY = 'minRole';

/**
 * Exige un rôle minimal (hiérarchie USER < MODERATOR < ADMIN).
 *   @MinRole('MODERATOR')  → accessible aux modérateurs ET aux administrateurs.
 */
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE_KEY, role);
