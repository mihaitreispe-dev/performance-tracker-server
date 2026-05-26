import { ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

import { OrganisationRole, EntitlementResourceType } from 'src/database/interfaces';
import { isPlatformAdmin } from 'src/lib/util/platform-admin';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import {
  EntitlementsService,
  LockStatusDTO,
  RequiredTierDTO,
} from 'src/modules/entitlements/entitlements.service';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { EntitlementsListResponse, LockStatusResponse } from './response.dto';

const ADMIN_ROLES: OrganisationRole[] = [OrganisationRole.OWNER, OrganisationRole.ADMIN];

/**
 * Thin admin wrapper around EntitlementsService. The wrapper exists
 * because:
 *
 *   - admin endpoints need the role check, which doesn't belong on the
 *     pure entitlements service (it's reused from public-API code paths
 *     that don't have a session-user identity in hand);
 *   - we want a stable surface for the controller to depend on so any
 *     future "log who changed which gate when" auditing slots in here
 *     without touching the core service.
 */
@Injectable()
export class EntitlementsApiService {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly userRepo: UserRepository,
  ) {}

  async list(
    req: Request & { user: AuthUser },
    organisationId: string,
    resourceType: EntitlementResourceType,
    resourceId: string,
  ): Promise<EntitlementsListResponse> {
    await this.ensureAdmin(req.user.id, organisationId);
    // Reuse getLockStatus with a null user — the locked flag is irrelevant
    // to admins (they always see the full set), but it gives us tier
    // hydration for free.
    const status = await this.entitlements.getLockStatus(null, resourceType, resourceId);
    return { data: status.requiredTiers };
  }

  async replace(
    req: Request & { user: AuthUser },
    organisationId: string,
    resourceType: EntitlementResourceType,
    resourceId: string,
    stripeProductIds: string[],
  ): Promise<EntitlementsListResponse> {
    await this.ensureAdmin(req.user.id, organisationId);
    const tiers: RequiredTierDTO[] = await this.entitlements.setEntitlementsForResource({
      organisationId,
      resourceType,
      resourceId,
      stripeProductIds,
    });
    return { data: tiers };
  }

  /**
   * Lock-status read for any authenticated member of the org — used by
   * athlete-facing surfaces in the admin app to decide between "render
   * the resource" and "render the paywall". Only requires membership,
   * not the admin role; the `userId` whose access we check is always
   * the session user, never overridden by the caller.
   */
  async lockStatus(
    req: Request & { user: AuthUser },
    organisationId: string,
    resourceType: EntitlementResourceType,
    resourceId: string,
  ): Promise<LockStatusResponse> {
    await this.ensureMember(req.user.id, organisationId);
    const status: LockStatusDTO = await this.entitlements.getLockStatus(
      req.user.id,
      resourceType,
      resourceId,
    );
    return { data: status };
  }

  private async ensureAdmin(userId: string, orgId: string): Promise<void> {
    const ok = await this.membershipRepo.hasRole(userId, orgId, ADMIN_ROLES);
    if (ok) return;
    if (await isPlatformAdmin(this.userRepo, userId)) return;
    throw new ForbiddenException('Insufficient permissions in this organisation');
  }

  /**
   * Member-level check — any active org membership counts. Used by
   * paywall reads where we don't want to leak entitlement metadata to
   * users who aren't in the org at all but DO want to let regular
   * athletes peek at their own lock state.
   */
  private async ensureMember(userId: string, orgId: string): Promise<void> {
    const ok = await this.membershipRepo.hasRole(userId, orgId, [
      OrganisationRole.OWNER,
      OrganisationRole.ADMIN,
      OrganisationRole.COACH,
      OrganisationRole.ATHLETE,
    ]);
    if (ok) return;
    if (await isPlatformAdmin(this.userRepo, userId)) return;
    throw new ForbiddenException('Not a member of this organisation');
  }
}
