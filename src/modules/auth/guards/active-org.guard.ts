import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganisationRole, UserRole } from 'src/database/interfaces';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

const SKIP_ACTIVE_ORG_KEY = 'SKIP_ACTIVE_ORG_KEY';
export const SkipActiveOrg = () => SetMetadata(SKIP_ACTIVE_ORG_KEY, true);

export const ACTIVE_ORG_HEADER = 'x-organisation-id';

export interface ActiveOrgContext {
  organisationId: string;
  role: OrganisationRole;
}

@Injectable()
export class ActiveOrgGuard implements CanActivate {
  constructor(
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly userRepo: UserRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ACTIVE_ORG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    if (!request.user) {
      // Unauthenticated routes are skipped by JwtAuthGuard before reaching here.
      // If we get here without a user, let it through; downstream auth handles it.
      return true;
    }

    // Prefer the org baked into the verified JWT (`org` claim) — it's signed
    // by us and can't be spoofed. Fall back to the X-Organisation-Id header
    // for org-agnostic tokens (the coach/athlete apps that switch active org
    // client-side). The header fallback is transitional and will be removed
    // once every client carries the claim.
    const claimOrg = (request.user as AuthUser).organisationId;
    const raw = request.headers[ACTIVE_ORG_HEADER];
    const headerOrg = Array.isArray(raw) ? raw[0] : raw;
    const orgId = claimOrg ?? (typeof headerOrg === 'string' ? headerOrg : undefined);
    if (!orgId) {
      throw new BadRequestException(
        `Missing organisation context (no token org claim or ${ACTIVE_ORG_HEADER} header)`,
      );
    }

    // Membership is still verified even when the org came from the signed
    // claim — defence in depth, and it's how the org-level role is resolved
    // (and how access is revoked if a membership is removed mid-token-life).
    const membership = await this.membershipRepo.findByUserAndOrg(request.user.id, orgId);
    if (membership) {
      request.activeOrg = { organisationId: orgId, role: membership.role } satisfies ActiveOrgContext;
      return true;
    }

    // System admins (UserRole.ADMIN — platform-level support role) can drop
    // into any org even without an explicit membership row. We synthesise an
    // admin-level activeOrg context so the per-route role checks downstream
    // behave as if they were an org-admin everywhere they go.
    //
    // `request.user.roles` is not populated by our JWT strategy — RolesGuard
    // also goes to the DB for the same reason — so we re-query here. One
    // extra round-trip per non-member request is fine; the membership lookup
    // above already established that the user isn't in this org, which is
    // the rare path (most requests come from real members).
    const roles = await this.userRepo.findRolesByUserId(request.user.id);
    if (roles.includes(UserRole.ADMIN)) {
      request.activeOrg = { organisationId: orgId, role: OrganisationRole.ADMIN } satisfies ActiveOrgContext;
      return true;
    }

    throw new ForbiddenException('You are not a member of this organisation');
  }
}
