import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { Organisation, User, UserRole } from 'src/database/interfaces';
import { AuthService } from 'src/modules/auth/services/auth.service';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { S3Service } from 'src/modules/s3/s3.service';
import { OrganisationRepository } from 'src/repositories/organisation.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { authUserFromUser } from '../auth/auth-user.mapper';
import { AuthSessionResponse } from '../auth/response.dto';
import {
  AdminOrganisationDTO,
  AdminOrganisationListResponse,
  AdminUserDTO,
  AdminUserListResponse,
} from './response.dto';

@Injectable()
export class AdminApiService {
  private readonly logger = new Logger(AdminApiService.name);

  constructor(
    private readonly userRepo: UserRepository,
    private readonly orgRepo: OrganisationRepository,
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly authService: AuthService,
    private readonly s3Service: S3Service,
  ) {}

  /**
   * Every org in the platform, annotated with the caller's own membership
   * role (when present) so the client switcher can highlight "you're in
   * this one" vs "you're dropping in as admin". Member counts come from a
   * single grouped query (see countMembersByOrgs) to keep this O(1) round-
   * trips regardless of org count.
   */
  async listAllOrganisations(req: Request & { user: AuthUser }): Promise<AdminOrganisationListResponse> {
    const orgs = await this.orgRepo.findAll();
    const orgIds = orgs.map((o) => o.id);
    const [counts, callerMemberships] = await Promise.all([
      this.membershipRepo.countMembersByOrgs(orgIds),
      this.membershipRepo.listByUser(req.user.id),
    ]);
    const myRoleByOrg = new Map(callerMemberships.map((m) => [m.organisation_id, m.role]));

    const data: AdminOrganisationDTO[] = await Promise.all(
      orgs.map(async (o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        logoUrl: await this.signLogo(o),
        myRole: myRoleByOrg.get(o.id) ?? null,
        memberCount: counts.get(o.id) ?? 0,
        createdAt: o.created_at instanceof Date ? o.created_at.toISOString() : String(o.created_at),
      })),
    );
    return { data };
  }

  /** Substring search across every user, for the impersonation picker. */
  async listUsers(query: string | undefined): Promise<AdminUserListResponse> {
    const users = await this.userRepo.findManyForAdmin(query);
    return { data: await Promise.all(users.map((u) => this.mapUserToDTO(u))) };
  }

  /**
   * Mint access + refresh tokens for `targetUserId` carrying an `imp` claim
   * pointing at the admin caller. From the client's perspective these are
   * regular session tokens — the caller swaps their stored tokens for these
   * and gains the target user's view of the platform. Logs at info level so
   * audit grep ("impersonating <id>") is one rg away.
   *
   * Guard rails:
   *   - Refuses to impersonate yourself (no-op, hides the banner without
   *     warning).
   *   - Refuses to impersonate another platform admin (privilege escalation
   *     loop / accidental destructive actions while masquerading).
   */
  async impersonate(
    req: Request & { user: AuthUser },
    targetUserId: string,
  ): Promise<AuthSessionResponse> {
    if (req.user.id === targetUserId) {
      throw new ForbiddenException('You are already this user.');
    }
    const target = await this.userRepo.findById(targetUserId);
    if (!target) {
      throw new NotFoundException('User not found');
    }
    const targetRoles = await this.userRepo.findRolesByUserId(targetUserId);
    if (targetRoles.includes(UserRole.ADMIN)) {
      // Treat platform admins as un-impersonatable. Avoids
      // admin-impersonating-admin chains and the surprise of a banner that
      // grants every privilege your own session already has.
      throw new ForbiddenException('Cannot impersonate another platform admin.');
    }

    const tokens = this.authService.generateTokens(targetUserId, {
      impersonatorId: req.user.id,
    });
    this.logger.log(`admin ${req.user.id} impersonating ${targetUserId}`);
    return {
      data: { ...tokens, user: authUserFromUser(target) },
    };
  }

  private async mapUserToDTO(u: User): Promise<AdminUserDTO> {
    let picture: string | null = null;
    if (u.picture_s3_bucket && u.picture_s3_key) {
      picture = await this.s3Service.getSignedUrlGET({
        bucket: u.picture_s3_bucket,
        key: u.picture_s3_key,
        expires: 3600,
      });
    }
    return {
      id: u.id,
      email: u.email,
      displayName: u.display_name ?? null,
      firstName: u.first_name ?? null,
      lastName: u.last_name ?? null,
      picture,
      roles: u.roles,
      createdAt: u.created_at instanceof Date ? u.created_at.toISOString() : String(u.created_at),
    };
  }

  private async signLogo(o: Organisation): Promise<string | null> {
    if (!o.logo_s3_bucket || !o.logo_s3_key) return null;
    return this.s3Service.getSignedUrlGET({
      bucket: o.logo_s3_bucket,
      key: o.logo_s3_key,
      expires: 3600,
    });
  }
}
