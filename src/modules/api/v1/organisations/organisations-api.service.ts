import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { Organisation, OrganisationRole } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { OrganisationRepository } from 'src/repositories/organisation.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';

import { CreateOrganisationDto, UpdateOrganisationDto } from './request.dto';
import { MyOrganisationDTO, MyOrganisationsListResponse, OrganisationDTO, OrganisationResponse } from './response.dto';

const ADMIN_ROLES: OrganisationRole[] = [OrganisationRole.OWNER, OrganisationRole.ADMIN];

@Injectable()
export class OrganisationsApiService {
  constructor(
    private readonly orgRepo: OrganisationRepository,
    private readonly membershipRepo: OrganisationMembershipRepository,
  ) {}

  async createOrganisation(
    req: Request & { user: AuthUser },
    dto: CreateOrganisationDto,
  ): Promise<OrganisationResponse> {
    const userId = req.user.id;
    const slug = dto.slug?.trim() || this.generateSlug(dto.name);

    const existing = await this.orgRepo.findBySlug(slug);
    if (existing) {
      throw new ConflictException(`Organisation slug "${slug}" is already taken`);
    }

    const organisation = await this.orgRepo.create({
      name: dto.name,
      slug,
      created_by_user_id: userId,
    });

    await this.membershipRepo.create({
      organisation_id: organisation.id,
      user_id: userId,
      role: OrganisationRole.OWNER,
      accepted_at: new Date(),
    });

    return { data: this.mapToDTO(organisation) };
  }

  async listMyOrganisations(req: Request & { user: AuthUser }): Promise<MyOrganisationsListResponse> {
    const userId = req.user.id;
    const memberships = await this.membershipRepo.listByUser(userId);
    if (memberships.length === 0) {
      return { data: [] };
    }
    const orgs = await Promise.all(memberships.map((m) => this.orgRepo.findById(m.organisation_id)));

    const data: MyOrganisationDTO[] = memberships
      .map((m, idx) => {
        const org = orgs[idx];
        if (!org) return null;
        return { ...this.mapToDTO(org), myRole: m.role };
      })
      .filter((x): x is MyOrganisationDTO => x !== null);

    return { data };
  }

  async getOrganisation(req: Request & { user: AuthUser }, id: string): Promise<OrganisationResponse> {
    await this.ensureMember(req.user.id, id);
    const organisation = await this.orgRepo.findById(id);
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    return { data: this.mapToDTO(organisation) };
  }

  async updateOrganisation(
    req: Request & { user: AuthUser },
    id: string,
    dto: UpdateOrganisationDto,
  ): Promise<OrganisationResponse> {
    await this.ensureRole(req.user.id, id, ADMIN_ROLES);

    if (dto.slug) {
      const existing = await this.orgRepo.findBySlug(dto.slug);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Organisation slug "${dto.slug}" is already taken`);
      }
    }

    const updated = await this.orgRepo.updateById(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
    });
    return { data: this.mapToDTO(updated) };
  }

  private async ensureMember(userId: string, organisationId: string): Promise<void> {
    const membership = await this.membershipRepo.findByUserAndOrg(userId, organisationId);
    if (!membership) {
      throw new ForbiddenException('You are not a member of this organisation');
    }
  }

  private async ensureRole(userId: string, organisationId: string, roles: OrganisationRole[]): Promise<void> {
    const ok = await this.membershipRepo.hasRole(userId, organisationId, roles);
    if (!ok) {
      throw new ForbiddenException('Insufficient permissions in this organisation');
    }
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    const suffix = Math.random().toString(36).slice(2, 8);
    return base ? `${base}-${suffix}` : suffix;
  }

  private mapToDTO(o: Organisation): OrganisationDTO {
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      logoUrl: null,
      createdAt: o.created_at instanceof Date ? o.created_at.toISOString() : String(o.created_at),
    };
  }
}
