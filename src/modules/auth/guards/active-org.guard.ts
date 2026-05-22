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

    const raw = request.headers[ACTIVE_ORG_HEADER];
    const orgId = Array.isArray(raw) ? raw[0] : raw;
    if (!orgId || typeof orgId !== 'string') {
      throw new BadRequestException(`Missing ${ACTIVE_ORG_HEADER} header`);
    }

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
