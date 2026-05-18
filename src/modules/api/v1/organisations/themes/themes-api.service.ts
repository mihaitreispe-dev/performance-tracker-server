import { ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { CopyOverrides, OrganisationRole, OrganisationTheme, ThemeTokens } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { OrganisationThemeRepository } from 'src/repositories/organisation-theme.repository';

import { UpdateThemeDto } from './request.dto';
import { ThemeDTO, ThemeResponse } from './response.dto';

const ADMIN_ROLES: OrganisationRole[] = [OrganisationRole.OWNER, OrganisationRole.ADMIN];

const EMPTY_TOKENS: ThemeTokens = {};
const EMPTY_OVERRIDES: CopyOverrides = {};

@Injectable()
export class ThemesApiService {
  constructor(
    private readonly themeRepo: OrganisationThemeRepository,
    private readonly membershipRepo: OrganisationMembershipRepository,
  ) {}

  async getTheme(req: Request & { user: AuthUser }, organisationId: string): Promise<ThemeResponse> {
    await this.ensureMember(req.user.id, organisationId);
    const theme = await this.themeRepo.findByOrganisationId(organisationId);
    return { data: this.mapToDTO(organisationId, theme) };
  }

  async updateTheme(
    req: Request & { user: AuthUser },
    organisationId: string,
    dto: UpdateThemeDto,
  ): Promise<ThemeResponse> {
    await this.ensureRole(req.user.id, organisationId, ADMIN_ROLES);

    const theme = await this.themeRepo.upsert({
      organisation_id: organisationId,
      theme_tokens: dto.themeTokens ?? EMPTY_TOKENS,
      copy_overrides: dto.copyOverrides ?? EMPTY_OVERRIDES,
      font_family: dto.fontFamily ?? null,
    });
    return { data: this.mapToDTO(organisationId, theme) };
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

  private mapToDTO(organisationId: string, theme?: OrganisationTheme): ThemeDTO {
    return {
      organisationId,
      themeTokens: theme?.theme_tokens ?? EMPTY_TOKENS,
      copyOverrides: theme?.copy_overrides ?? EMPTY_OVERRIDES,
      fontFamily: theme?.font_family ?? null,
      faviconUrl: null,
    };
  }
}
