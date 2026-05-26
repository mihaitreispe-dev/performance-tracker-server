import { ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

import { OrganisationRole, EntitlementResourceType } from 'src/database/interfaces';
import { isPlatformAdmin } from 'src/lib/util/platform-admin';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import {
  EntitlementsService,
  RequiredTierDTO,
} from 'src/modules/entitlements/entitlements.service';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { EntitlementsListResponse } from './response.dto';

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

  private async ensureAdmin(userId: string, orgId: string): Promise<void> {
    const ok = await this.membershipRepo.hasRole(userId, orgId, ADMIN_ROLES);
    if (ok) return;
    if (await isPlatformAdmin(this.userRepo, userId)) return;
    throw new ForbiddenException('Insufficient permissions in this organisation');
  }
}
