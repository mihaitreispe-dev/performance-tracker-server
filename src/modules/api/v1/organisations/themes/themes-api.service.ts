import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { CopyOverrides, OrganisationRole, OrganisationTheme, ThemeTokens } from 'src/database/interfaces';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { S3Service } from 'src/modules/s3/s3.service';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { OrganisationThemeRepository } from 'src/repositories/organisation-theme.repository';
import { v4 as uuidv4 } from 'uuid';

import { ConfirmFaviconUploadDto, RequestFaviconUploadDto, UpdateThemeDto } from './request.dto';
import { FaviconUploadResponse, ThemeDTO, ThemeResponse } from './response.dto';

const ADMIN_ROLES: OrganisationRole[] = [OrganisationRole.OWNER, OrganisationRole.ADMIN];

const EMPTY_TOKENS: ThemeTokens = {};
const EMPTY_OVERRIDES: CopyOverrides = {};

const FAVICON_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/svg+xml': 'svg',
};

@Injectable()
export class ThemesApiService {
  constructor(
    private readonly themeRepo: OrganisationThemeRepository,
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly s3Service: S3Service,
  ) {}

  async getTheme(req: Request & { user: AuthUser }, organisationId: string): Promise<ThemeResponse> {
    await this.ensureMember(req.user.id, organisationId);
    const theme = await this.themeRepo.findByOrganisationId(organisationId);
    return { data: await this.mapToDTO(organisationId, theme) };
  }

  async updateTheme(
    req: Request & { user: AuthUser },
    organisationId: string,
    dto: UpdateThemeDto,
  ): Promise<ThemeResponse> {
    await this.ensureRole(req.user.id, organisationId, ADMIN_ROLES);

    // Preserve favicon fields across updates that don't touch them — only colour tokens
    // / copy / font are user-editable from the BrandingPage form. Favicon comes from
    // requestFaviconUpload + confirmFaviconUpload below.
    const existing = await this.themeRepo.findByOrganisationId(organisationId);
    const theme = await this.themeRepo.upsert({
      organisation_id: organisationId,
      theme_tokens: dto.themeTokens ?? EMPTY_TOKENS,
      copy_overrides: dto.copyOverrides ?? EMPTY_OVERRIDES,
      font_family: dto.fontFamily ?? null,
      favicon_s3_bucket: existing?.favicon_s3_bucket ?? null,
      favicon_s3_key: existing?.favicon_s3_key ?? null,
    });
    return { data: await this.mapToDTO(organisationId, theme) };
  }

  async requestFaviconUpload(
    req: Request & { user: AuthUser },
    organisationId: string,
    dto: RequestFaviconUploadDto,
  ): Promise<FaviconUploadResponse> {
    await this.ensureRole(req.user.id, organisationId, ADMIN_ROLES);

    const ext = FAVICON_EXT[dto.mimeType];
    if (!ext) {
      throw new BadRequestException(`Unsupported mime type "${dto.mimeType}"`);
    }
    const filename = `${uuidv4()}.${ext}`;
    const key = s3Keys.upload.organisationFavicon({ organisationId, filename }).favicon;

    const uploadUrl = await this.s3Service.getSignedUrlPUT({
      bucket: this.s3Service.uploadBucket,
      key,
      contentType: dto.mimeType,
      expires: 3600,
    });

    return { data: { uploadUrl, bucket: this.s3Service.uploadBucket, key } };
  }

  async confirmFaviconUpload(
    req: Request & { user: AuthUser },
    organisationId: string,
    body: ConfirmFaviconUploadDto,
  ): Promise<ThemeResponse> {
    await this.ensureRole(req.user.id, organisationId, ADMIN_ROLES);

    const existing = await this.themeRepo.findByOrganisationId(organisationId);
    const exists = await this.s3Service.objectExists({ bucket: body.bucket, key: body.key });
    if (!exists) {
      throw new BadRequestException('No object found at the expected upload location yet');
    }

    // Best-effort cleanup of the previous favicon.
    if (existing?.favicon_s3_bucket && existing.favicon_s3_key && existing.favicon_s3_key !== body.key) {
      try {
        await this.s3Service.deleteObject({ bucket: existing.favicon_s3_bucket, key: existing.favicon_s3_key });
      } catch {
        // best-effort
      }
    }

    const theme = await this.themeRepo.upsert({
      organisation_id: organisationId,
      theme_tokens: existing?.theme_tokens ?? EMPTY_TOKENS,
      copy_overrides: existing?.copy_overrides ?? EMPTY_OVERRIDES,
      font_family: existing?.font_family ?? null,
      favicon_s3_bucket: body.bucket,
      favicon_s3_key: body.key,
    });
    return { data: await this.mapToDTO(organisationId, theme) };
  }

  async clearFavicon(req: Request & { user: AuthUser }, organisationId: string): Promise<ThemeResponse> {
    await this.ensureRole(req.user.id, organisationId, ADMIN_ROLES);
    const existing = await this.themeRepo.findByOrganisationId(organisationId);
    if (!existing) {
      throw new NotFoundException('No theme to update');
    }
    if (existing.favicon_s3_bucket && existing.favicon_s3_key) {
      try {
        await this.s3Service.deleteObject({
          bucket: existing.favicon_s3_bucket,
          key: existing.favicon_s3_key,
        });
      } catch {
        // best-effort
      }
    }
    const theme = await this.themeRepo.upsert({
      organisation_id: organisationId,
      theme_tokens: existing.theme_tokens,
      copy_overrides: existing.copy_overrides,
      font_family: existing.font_family,
      favicon_s3_bucket: null,
      favicon_s3_key: null,
    });
    return { data: await this.mapToDTO(organisationId, theme) };
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

  private async mapToDTO(organisationId: string, theme?: OrganisationTheme): Promise<ThemeDTO> {
    return {
      organisationId,
      themeTokens: theme?.theme_tokens ?? EMPTY_TOKENS,
      copyOverrides: theme?.copy_overrides ?? EMPTY_OVERRIDES,
      fontFamily: theme?.font_family ?? null,
      faviconUrl:
        theme?.favicon_s3_bucket && theme.favicon_s3_key
          ? await this.s3Service.getSignedUrlGET({
              bucket: theme.favicon_s3_bucket,
              key: theme.favicon_s3_key,
              expires: 3600,
            })
          : null,
    };
  }
}
