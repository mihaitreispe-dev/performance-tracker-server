import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  CoachAthleteStatus,
  ClientType,
  NotificationType,
  OrganisationMembership,
  OrganisationRole,
  User,
} from 'src/database/interfaces';
import { isPlatformAdmin } from 'src/lib/util/platform-admin';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { MembershipAuditLogRepository } from 'src/repositories/membership-audit-log.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { ClientProvisioningService } from '../client-profiles/client-provisioning.service';
import { NotificationsApiService } from '../../notifications/notifications-api.service';
import { InviteMemberDto, UpdateMembershipRoleDto } from './request.dto';
import { MembershipDTO, MembershipResponse, MembershipsListResponse } from './response.dto';

/**
 * Numeric rank for role-ceiling checks. Higher = more authority.
 * Used so an inviter can only target a role at or below their own —
 * a coach can't promote themselves to admin via the invite endpoint,
 * an admin can't elevate someone past their own admin tier, etc.
 * Platform admins bypass this scale entirely; they're staff support.
 */
const ROLE_RANK: Record<OrganisationRole, number> = {
  [OrganisationRole.OWNER]: 4,
  [OrganisationRole.ADMIN]: 3,
  [OrganisationRole.COACH]: 2,
  [OrganisationRole.ATHLETE]: 1,
};

/**
 * Roles allowed to invite / remove / update memberships. Coach is in
 * this list — the per-call role-ceiling check below is what stops a
 * coach from inviting peers as owners/admins. (Pre-coach-invite the
 * gate was OWNER|ADMIN only; widening the gate without the ceiling
 * would have been a privilege-escalation vector.)
 */
const MANAGE_MEMBERSHIP_ROLES: OrganisationRole[] = [
  OrganisationRole.OWNER,
  OrganisationRole.ADMIN,
  OrganisationRole.COACH,
];

@Injectable()
export class MembershipsApiService {
  constructor(
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly userRepo: UserRepository,
    private readonly provisioningService: ClientProvisioningService,
    private readonly coachAthleteRepo: CoachAthleteRelationshipRepository,
    private readonly auditRepo: MembershipAuditLogRepository,
    private readonly notificationsService: NotificationsApiService,
  ) {}

  async listMembers(req: Request & { user: AuthUser }, orgId: string): Promise<MembershipsListResponse> {
    await this.ensureMember(req.user.id, orgId);
    const memberships = await this.membershipRepo.listByOrg(orgId);
    if (memberships.length === 0) {
      return { data: [] };
    }
    const userIds = memberships.map((m) => m.user_id);
    const users = await this.userRepo.findByIds(userIds);
    const usersById = new Map(users.map((u) => [u.id, u]));
    return { data: memberships.map((m) => this.mapToDTO(m, usersById.get(m.user_id))) };
  }

  async inviteMember(
    req: Request & { user: AuthUser },
    orgId: string,
    dto: InviteMemberDto,
  ): Promise<MembershipResponse> {
    // Gate widens to include COACH; the per-call ceiling below stops
    // coaches inviting peers as admins/owners and admins inviting
    // peers as owners.
    const inviterRole = await this.resolveActorRole(req.user.id, orgId, MANAGE_MEMBERSHIP_ROLES);
    this.assertCanTargetRole(inviterRole, dto.role);

    const invitee = await this.userRepo.findByEmail(dto.email);
    if (!invitee) {
      throw new NotFoundException(`No user found with email ${dto.email}`);
    }
    const existing = await this.membershipRepo.findByUserAndOrg(invitee.id, orgId);
    if (existing) {
      throw new ConflictException('User is already a member of this organisation');
    }

    // client_type only applies to ATHLETE-roled memberships — DB CHECK enforces
    // null elsewhere. Default to 'general' (the lighter-touch track); admins
    // pick 'athlete' for full one-to-one coaching clients on the Members tab.
    const clientType: ClientType | null =
      dto.role === OrganisationRole.ATHLETE ? dto.clientType ?? ClientType.GENERAL : null;

    const membership = await this.membershipRepo.create({
      organisation_id: orgId,
      user_id: invitee.id,
      role: dto.role,
      client_type: clientType,
      invited_by_user_id: req.user.id,
      invitation_message: dto.invitationMessage?.trim() || null,
    });

    if (clientType) {
      // Same fire-and-forget pattern as the API-key path — provisioning errors
      // don't block the invite from succeeding.
      await this.provisioningService.applyClientTypeDefaults({
        organisationId: orgId,
        athleteUserId: invitee.id,
        clientType,
      });
    }

    // When a coach invites an athlete, auto-create the coach-athlete
    // relationship in PENDING — without it the coach can't read the
    // athlete's workouts / executions / metrics (the dedicated guards
    // gate on coach_athlete_relationships, not on org membership).
    // Owners / admins inviting athletes skip this auto-link; they
    // manage clients at the org level, not through a coach binding.
    // The relationship-create is best-effort: duplicate rows on a
    // re-invite aren't fatal; we capture the row ID for the
    // INVITATION_RECEIVED notification on success.
    let coachAthleteRelationshipId: string | null = null;
    if (
      inviterRole === OrganisationRole.COACH &&
      dto.role === OrganisationRole.ATHLETE &&
      req.user.id !== invitee.id
    ) {
      const created = await this.coachAthleteRepo
        .create({
          organisation_id: orgId,
          coach_id: req.user.id,
          athlete_id: invitee.id,
          status: CoachAthleteStatus.PENDING,
          invitation_message: dto.invitationMessage?.trim() || null,
        })
        .catch(() => null);
      coachAthleteRelationshipId = created?.id ?? null;

      // Notify the athlete — same shape the /coaching/invitations
      // path uses, so the athlete-app sees one consistent stream
      // regardless of which entry point the coach used. Swallowed
      // because a notification hiccup shouldn't fail the invite.
      if (coachAthleteRelationshipId) {
        const coach = await this.userRepo.findById(req.user.id);
        const coachName = coach?.display_name || coach?.email || 'Your new coach';
        await this.notificationsService
          .createNotification(
            invitee.id,
            NotificationType.INVITATION_RECEIVED,
            `${coachName} invited you to coach you`,
            dto.invitationMessage?.trim() || undefined,
            {
              coachId: req.user.id,
              relationshipId: coachAthleteRelationshipId,
              senderName: coachName,
            },
          )
          .catch(() => undefined);
      }
    }

    await this.auditRepo.record({
      organisation_id: orgId,
      actor_user_id: req.user.id,
      target_user_id: invitee.id,
      membership_id: membership.id,
      action: 'invited',
      from_role: null,
      to_role: dto.role,
      actor_role: inviterRole,
      metadata: { clientType: clientType ?? null, hasMessage: !!dto.invitationMessage?.trim() },
    });

    return { data: this.mapToDTO(membership, invitee) };
  }

  async updateRole(
    req: Request & { user: AuthUser },
    orgId: string,
    membershipId: string,
    dto: UpdateMembershipRoleDto,
  ): Promise<MembershipResponse> {
    const inviterRole = await this.resolveActorRole(req.user.id, orgId, MANAGE_MEMBERSHIP_ROLES);

    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership || membership.organisation_id !== orgId) {
      throw new NotFoundException('Membership not found');
    }
    if (membership.user_id === req.user.id && membership.role === OrganisationRole.OWNER) {
      throw new BadRequestException('Owners cannot demote themselves');
    }
    // Both the current role of the target AND the new role must be at
    // or below the actor's own role. Otherwise a coach could demote
    // an owner just because their own role outranks 'athlete'.
    this.assertCanTargetRole(inviterRole, membership.role);
    this.assertCanTargetRole(inviterRole, dto.role);

    const updated = await this.membershipRepo.updateById(membershipId, { role: dto.role });
    const user = await this.userRepo.findById(updated.user_id);
    await this.auditRepo.record({
      organisation_id: orgId,
      actor_user_id: req.user.id,
      target_user_id: updated.user_id,
      membership_id: updated.id,
      action: 'role_changed',
      from_role: membership.role,
      to_role: dto.role,
      actor_role: inviterRole,
      metadata: {},
    });
    return { data: this.mapToDTO(updated, user ?? undefined) };
  }

  async removeMember(
    req: Request & { user: AuthUser },
    orgId: string,
    membershipId: string,
  ): Promise<void> {
    const inviterRole = await this.resolveActorRole(req.user.id, orgId, MANAGE_MEMBERSHIP_ROLES);

    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership || membership.organisation_id !== orgId) {
      throw new NotFoundException('Membership not found');
    }
    if (membership.user_id === req.user.id && membership.role === OrganisationRole.OWNER) {
      throw new BadRequestException('Owners cannot remove themselves');
    }
    // Removal follows the same ceiling as invite / role-change: a
    // coach can remove athletes but not peers / admins / owners; an
    // admin can remove anyone below or at admin tier but not the
    // owner.
    this.assertCanTargetRole(inviterRole, membership.role);
    await this.membershipRepo.deleteById(membershipId);
    await this.auditRepo.record({
      organisation_id: orgId,
      actor_user_id: req.user.id,
      target_user_id: membership.user_id,
      membership_id: membership.id,
      action: 'removed',
      from_role: membership.role,
      to_role: null,
      actor_role: inviterRole,
      metadata: {},
    });
  }

  async acceptInvitation(
    req: Request & { user: AuthUser },
    orgId: string,
    membershipId: string,
  ): Promise<MembershipResponse> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership || membership.organisation_id !== orgId || membership.user_id !== req.user.id) {
      throw new NotFoundException('Membership not found');
    }
    const accepted = await this.membershipRepo.accept(membershipId);
    const user = await this.userRepo.findById(accepted.user_id);
    await this.auditRepo.record({
      organisation_id: orgId,
      actor_user_id: req.user.id,
      target_user_id: accepted.user_id,
      membership_id: accepted.id,
      action: 'accepted',
      from_role: null,
      to_role: accepted.role,
      // The accepter IS the target, so actor_role mirrors the
      // accepted role at the time. We don't run resolveActorRole here
      // because the caller may not yet have other-org membership the
      // helper expects.
      actor_role: accepted.role,
      metadata: {},
    });
    return { data: this.mapToDTO(accepted, user ?? undefined) };
  }

  /**
   * Self-service leave-org. Owners must hand off ownership first to avoid orphan orgs.
   */
  async leaveOrganisation(req: Request & { user: AuthUser }, orgId: string): Promise<void> {
    const membership = await this.membershipRepo.findByUserAndOrg(req.user.id, orgId);
    if (!membership) {
      throw new NotFoundException('You are not a member of this organisation');
    }
    if (membership.role === OrganisationRole.OWNER) {
      throw new BadRequestException(
        'Owners must transfer ownership to another member before leaving the organisation',
      );
    }
    await this.membershipRepo.deleteById(membership.id);
    await this.auditRepo.record({
      organisation_id: orgId,
      actor_user_id: req.user.id,
      target_user_id: req.user.id,
      membership_id: membership.id,
      action: 'self_left',
      from_role: membership.role,
      to_role: null,
      actor_role: membership.role,
      metadata: {},
    });
  }

  private async ensureMember(userId: string, orgId: string): Promise<void> {
    const membership = await this.membershipRepo.findByUserAndOrg(userId, orgId);
    if (membership) return;
    if (await isPlatformAdmin(this.userRepo, userId)) return;
    throw new ForbiddenException('You are not a member of this organisation');
  }

  private async ensureRole(userId: string, orgId: string, roles: OrganisationRole[]): Promise<void> {
    const ok = await this.membershipRepo.hasRole(userId, orgId, roles);
    if (ok) return;
    if (await isPlatformAdmin(this.userRepo, userId)) return;
    throw new ForbiddenException('Insufficient permissions in this organisation');
  }

  /**
   * Look up the caller's role in the org. Platform admins (no
   * membership row at all) get an `OWNER`-equivalent placeholder
   * since they have full authority via ActiveOrgGuard's bypass.
   * Returns the role so per-call ceiling checks can do their work;
   * throws Forbidden otherwise.
   */
  private async resolveActorRole(
    userId: string,
    orgId: string,
    allowed: OrganisationRole[],
  ): Promise<OrganisationRole> {
    const membership = await this.membershipRepo.findByUserAndOrg(userId, orgId);
    if (membership && allowed.includes(membership.role)) {
      return membership.role;
    }
    if (await isPlatformAdmin(this.userRepo, userId)) {
      return OrganisationRole.OWNER;
    }
    throw new ForbiddenException('Insufficient permissions in this organisation');
  }

  /**
   * Reject if the actor would be acting on a role that outranks them.
   * Coach → can target ATHLETE only; admin → ATHLETE, COACH, or
   * ADMIN; owner → anything. The check uses the ROLE_RANK ordering so
   * adding a new role only needs one line update in that table.
   */
  private assertCanTargetRole(actor: OrganisationRole, target: OrganisationRole): void {
    if (ROLE_RANK[target] > ROLE_RANK[actor]) {
      throw new ForbiddenException(
        `You don't have permission to act on a ${target} membership at your role`,
      );
    }
  }

  private mapToDTO(m: OrganisationMembership, user?: User): MembershipDTO {
    return {
      id: m.id,
      organisationId: m.organisation_id,
      userId: m.user_id,
      userEmail: user?.email ?? '',
      userDisplayName: user?.display_name ?? null,
      role: m.role,
      clientType: m.client_type,
      invitedByUserId: m.invited_by_user_id,
      invitationMessage: m.invitation_message,
      metadata: (m.metadata ?? {}) as Record<string, unknown>,
      invitedAt: m.invited_at instanceof Date ? m.invited_at.toISOString() : String(m.invited_at),
      acceptedAt: m.accepted_at
        ? m.accepted_at instanceof Date
          ? m.accepted_at.toISOString()
          : String(m.accepted_at)
        : null,
    };
  }
}
