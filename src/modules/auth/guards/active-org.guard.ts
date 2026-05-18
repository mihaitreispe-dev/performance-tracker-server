import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganisationRole } from 'src/database/interfaces';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';

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
    if (!membership) {
      throw new ForbiddenException('You are not a member of this organisation');
    }

    request.activeOrg = { organisationId: orgId, role: membership.role } satisfies ActiveOrgContext;
    return true;
  }
}
