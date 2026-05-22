import { UserRole } from 'src/database/interfaces';
import { UserRepository } from 'src/repositories/user.repository';

/**
 * Resolves whether the caller holds the platform-level `UserRole.ADMIN`
 * role — distinct from any org-scoped owner/admin role.
 *
 * Used by every per-org guard that needs to let platform admins through
 * even when they're not members of the target org (parity with what
 * ActiveOrgGuard does at the request edge). Roles live in the DB rather
 * than on the JWT — same source RolesGuard reads from — so this hits one
 * row per call. Postgres has the user in cache after the first hit, so
 * the cost per request is one logical lookup.
 */
export async function isPlatformAdmin(
  userRepo: UserRepository,
  userId: string,
): Promise<boolean> {
  const roles = await userRepo.findRolesByUserId(userId);
  return roles.includes(UserRole.ADMIN);
}
