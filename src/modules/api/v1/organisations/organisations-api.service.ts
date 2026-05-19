import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { Organisation, OrganisationRole } from 'src/database/interfaces';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { S3Service } from 'src/modules/s3/s3.service';
import { OrganisationRepository } from 'src/repositories/organisation.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { v4 as uuidv4 } from 'uuid';

import { OrganisationThemeRepository } from 'src/repositories/organisation-theme.repository';

import { CreateOrganisationDto, RequestLogoUploadDto, UpdateOrganisationDto } from './request.dto';
import {
  LogoUploadResponse,
  MyOrganisationDTO,
  MyOrganisationsListResponse,
  OrganisationDTO,
  OrganisationResponse,
  PendingInvitationDTO,
  PendingInvitationsListResponse,
} from './response.dto';

const ADMIN_ROLES: OrganisationRole[] = [OrganisationRole.OWNER, OrganisationRole.ADMIN];

/** Backfill helper orgs that should not appear in the end-user org switcher. */
const HIDDEN_ORG_SLUGS = new Set(['personal-athletes', 'system']);

/**
 * Seeded onto every freshly-created org so the brand experience is non-blank from minute one.
 * Owners overwrite any of these on the Branding page. Keep the keys aligned with `OrgThemeOverride`
 * on the client (primary/secondary/background/surface/text).
 */
const DEFAULT_THEME_TOKENS: Record<string, string> = {
  primary: '#5b6cff',
  secondary: '#22c1c3',
};

const LOGO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

@Injectable()
export class OrganisationsApiService {
  constructor(
    private readonly orgRepo: OrganisationRepository,
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly themeRepo: OrganisationThemeRepository,
    private readonly s3Service: S3Service,
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

    await this.themeRepo.upsert({
      organisation_id: organisation.id,
      theme_tokens: DEFAULT_THEME_TOKENS,
      copy_overrides: {},
    });

    return { data: await this.mapToDTO(organisation) };
  }

  async listMyOrganisations(req: Request & { user: AuthUser }): Promise<MyOrganisationsListResponse> {
    const userId = req.user.id;
    const memberships = await this.membershipRepo.listAcceptedByUser(userId);
    if (memberships.length === 0) {
      return { data: [] };
    }
    const orgs = await Promise.all(memberships.map((m) => this.orgRepo.findById(m.organisation_id)));

    const data: MyOrganisationDTO[] = (
      await Promise.all(
        memberships.map(async (m, idx) => {
          const org = orgs[idx];
          if (!org || HIDDEN_ORG_SLUGS.has(org.slug)) return null;
          return { ...(await this.mapToDTO(org)), myRole: m.role } satisfies MyOrganisationDTO;
        }),
      )
    ).filter((x): x is MyOrganisationDTO => x !== null);

    return { data };
  }

  async listPendingInvitations(req: Request & { user: AuthUser }): Promise<PendingInvitationsListResponse> {
    const memberships = await this.membershipRepo.listPendingByUser(req.user.id);
    if (memberships.length === 0) {
      return { data: [] };
    }
    const orgs = await Promise.all(memberships.map((m) => this.orgRepo.findById(m.organisation_id)));

    const data: PendingInvitationDTO[] = (
      await Promise.all(
        memberships.map(async (m, idx) => {
          const org = orgs[idx];
          if (!org || HIDDEN_ORG_SLUGS.has(org.slug)) return null;
          return {
            membershipId: m.id,
            organisation: await this.mapToDTO(org),
            role: m.role,
            invitedAt: m.invited_at instanceof Date ? m.invited_at.toISOString() : String(m.invited_at),
            invitedByUserId: m.invited_by_user_id,
            invitationMessage: m.invitation_message,
          } satisfies PendingInvitationDTO;
        }),
      )
    ).filter((x): x is PendingInvitationDTO => x !== null);

    return { data };
  }

  async getOrganisation(req: Request & { user: AuthUser }, id: string): Promise<OrganisationResponse> {
    await this.ensureMember(req.user.id, id);
    const organisation = await this.orgRepo.findById(id);
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    return { data: await this.mapToDTO(organisation) };
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
    return { data: await this.mapToDTO(updated) };
  }

  async requestLogoUpload(
    req: Request & { user: AuthUser },
    id: string,
    dto: RequestLogoUploadDto,
  ): Promise<LogoUploadResponse> {
    await this.ensureRole(req.user.id, id, ADMIN_ROLES);
    const org = await this.orgRepo.findById(id);
    if (!org) {
      throw new NotFoundException('Organisation not found');
    }

    const ext = LOGO_EXT[dto.mimeType];
    if (!ext) {
      throw new BadRequestException(`Unsupported mime type "${dto.mimeType}"`);
    }
    const filename = `${uuidv4()}.${ext}`;
    const key = s3Keys.upload.organisationLogo({ organisationId: id, filename }).logo;

    const uploadUrl = await this.s3Service.getSignedUrlPUT({
      bucket: this.s3Service.uploadBucket,
      key,
      contentType: dto.mimeType,
      expires: 3600,
    });

    return { data: { uploadUrl, bucket: this.s3Service.uploadBucket, key } };
  }

  async confirmLogoUpload(
    req: Request & { user: AuthUser },
    id: string,
    body: { bucket: string; key: string },
  ): Promise<OrganisationResponse> {
    await this.ensureRole(req.user.id, id, ADMIN_ROLES);
    const org = await this.orgRepo.findById(id);
    if (!org) {
      throw new NotFoundException('Organisation not found');
    }
    const exists = await this.s3Service.objectExists({ bucket: body.bucket, key: body.key });
    if (!exists) {
      throw new BadRequestException('No object found at the expected upload location yet');
    }

    // Delete the previous logo (best-effort) before swapping the pointer.
    if (org.logo_s3_bucket && org.logo_s3_key && org.logo_s3_key !== body.key) {
      try {
        await this.s3Service.deleteObject({ bucket: org.logo_s3_bucket, key: org.logo_s3_key });
      } catch {
        // best-effort
      }
    }

    const updated = await this.orgRepo.updateById(id, {
      logo_s3_bucket: body.bucket,
      logo_s3_key: body.key,
    });
    return { data: await this.mapToDTO(updated) };
  }

  async clearLogo(req: Request & { user: AuthUser }, id: string): Promise<OrganisationResponse> {
    await this.ensureRole(req.user.id, id, ADMIN_ROLES);
    const org = await this.orgRepo.findById(id);
    if (!org) {
      throw new NotFoundException('Organisation not found');
    }
    if (org.logo_s3_bucket && org.logo_s3_key) {
      try {
        await this.s3Service.deleteObject({ bucket: org.logo_s3_bucket, key: org.logo_s3_key });
      } catch {
        // best-effort
      }
    }
    const updated = await this.orgRepo.updateById(id, { logo_s3_bucket: null, logo_s3_key: null });
    return { data: await this.mapToDTO(updated) };
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

  private async mapToDTO(o: Organisation): Promise<OrganisationDTO> {
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      logoUrl:
        o.logo_s3_bucket && o.logo_s3_key
          ? await this.s3Service.getSignedUrlGET({ bucket: o.logo_s3_bucket, key: o.logo_s3_key, expires: 3600 })
          : null,
      createdAt: o.created_at instanceof Date ? o.created_at.toISOString() : String(o.created_at),
    };
  }
}
