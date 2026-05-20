import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { ClientType, OrganisationMembership, OrganisationRole, User } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { ClientProvisioningService } from '../client-profiles/client-provisioning.service';
import { InviteMemberDto, UpdateMembershipRoleDto } from './request.dto';
import { MembershipDTO, MembershipResponse, MembershipsListResponse } from './response.dto';

const ADMIN_ROLES: OrganisationRole[] = [OrganisationRole.OWNER, OrganisationRole.ADMIN];

@Injectable()
export class MembershipsApiService {
  constructor(
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly userRepo: UserRepository,
    private readonly provisioningService: ClientProvisioningService,
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
    await this.ensureRole(req.user.id, orgId, ADMIN_ROLES);

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

    return { data: this.mapToDTO(membership, invitee) };
  }

  async updateRole(
    req: Request & { user: AuthUser },
    orgId: string,
    membershipId: string,
    dto: UpdateMembershipRoleDto,
  ): Promise<MembershipResponse> {
    await this.ensureRole(req.user.id, orgId, ADMIN_ROLES);

    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership || membership.organisation_id !== orgId) {
      throw new NotFoundException('Membership not found');
    }
    if (membership.user_id === req.user.id && membership.role === OrganisationRole.OWNER) {
      throw new BadRequestException('Owners cannot demote themselves');
    }

    const updated = await this.membershipRepo.updateById(membershipId, { role: dto.role });
    const user = await this.userRepo.findById(updated.user_id);
    return { data: this.mapToDTO(updated, user ?? undefined) };
  }

  async removeMember(
    req: Request & { user: AuthUser },
    orgId: string,
    membershipId: string,
  ): Promise<void> {
    await this.ensureRole(req.user.id, orgId, ADMIN_ROLES);

    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership || membership.organisation_id !== orgId) {
      throw new NotFoundException('Membership not found');
    }
    if (membership.user_id === req.user.id && membership.role === OrganisationRole.OWNER) {
      throw new BadRequestException('Owners cannot remove themselves');
    }
    await this.membershipRepo.deleteById(membershipId);
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
  }

  private async ensureMember(userId: string, orgId: string): Promise<void> {
    const membership = await this.membershipRepo.findByUserAndOrg(userId, orgId);
    if (!membership) {
      throw new ForbiddenException('You are not a member of this organisation');
    }
  }

  private async ensureRole(userId: string, orgId: string, roles: OrganisationRole[]): Promise<void> {
    const ok = await this.membershipRepo.hasRole(userId, orgId, roles);
    if (!ok) {
      throw new ForbiddenException('Insufficient permissions in this organisation');
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
