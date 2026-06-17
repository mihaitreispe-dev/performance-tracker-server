import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { UserRole } from 'src/database/interfaces';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { AuthSessionResponse } from '../auth/response.dto';
import { AdminApiService } from './admin-api.service';
import {
  AdminActivityQuery,
  AdminApiKeyIdParam,
  AdminOrgIdParam,
  AdminUserSearchQuery,
  ImpersonateDto,
  IssueApiKeyBody,
} from './request.dto';
import {
  AdminActivityResponse,
  AdminApiKeyDTO,
  AdminApiKeyListResponse,
  AdminApiUsageResponse,
  AdminIssuedApiKeyResponse,
  AdminOrganisationDetailResponse,
  AdminOrganisationListResponse,
  AdminOverviewResponse,
  AdminUserListResponse,
} from './response.dto';

@ApiTags('Admin')
@ApiBearerAuth('JWT')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SkipActiveOrg()
export class AdminApiController {
  constructor(private readonly service: AdminApiService) {}

  @Get('organisations')
  @ApiOperation({
    summary:
      'List every organisation on the platform with the caller\'s own membership role (null when they are dropping in as platform admin).',
  })
  @ApiOkResponse({ type: AdminOrganisationListResponse })
  async listAllOrganisations(
    @Req() req: Request & { user: AuthUser },
  ): Promise<AdminOrganisationListResponse> {
    return this.service.listAllOrganisations(req);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Top-line platform totals (orgs, users, active users, coaches/athletes, workouts/snacks, API volume) for the admin dashboard.' })
  @ApiOkResponse({ type: AdminOverviewResponse })
  async getOverview(): Promise<AdminOverviewResponse> {
    return this.service.getOverview();
  }

  @Get('organisations/:id')
  @ApiOperation({ summary: 'One org in detail — roster by role, module state, active API key count, last activity.' })
  @ApiOkResponse({ type: AdminOrganisationDetailResponse })
  async getOrganisationDetail(@Param() params: AdminOrgIdParam): Promise<AdminOrganisationDetailResponse> {
    return this.service.getOrganisationDetail(params.id);
  }

  @Get('organisations/:id/activity')
  @ApiOperation({ summary: 'Daily workout + snack activity for an org over a date range, plus active members + totals.' })
  @ApiOkResponse({ type: AdminActivityResponse })
  async getActivity(
    @Param() params: AdminOrgIdParam,
    @Query() query: AdminActivityQuery,
  ): Promise<AdminActivityResponse> {
    return this.service.getActivity(params.id, query.from, query.to);
  }

  @Get('organisations/:id/api-keys')
  @ApiOperation({ summary: "List an org's API keys (prefixes + metadata; never the secret)." })
  @ApiOkResponse({ type: AdminApiKeyListResponse })
  async listApiKeys(@Param() params: AdminOrgIdParam): Promise<AdminApiKeyListResponse> {
    return this.service.listApiKeys(params.id);
  }

  @Post('organisations/:id/api-keys')
  @ApiOperation({ summary: 'Issue a new API key for an org. Returns the cleartext key once.' })
  @ApiOkResponse({ type: AdminIssuedApiKeyResponse })
  async issueApiKey(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AdminOrgIdParam,
    @Body() body: IssueApiKeyBody,
  ): Promise<AdminIssuedApiKeyResponse> {
    return this.service.issueApiKey(params.id, req.user.id, body);
  }

  @Post('api-keys/:id/revoke')
  @ApiOperation({ summary: 'Revoke an API key by id.' })
  @ApiOkResponse({ type: AdminApiKeyDTO })
  async revokeApiKey(@Param() params: AdminApiKeyIdParam): Promise<AdminApiKeyDTO> {
    return this.service.revokeApiKey(params.id);
  }

  @Get('organisations/:id/api-usage')
  @ApiOperation({ summary: 'Daily API request/error series + top endpoints for an org over a range.' })
  @ApiOkResponse({ type: AdminApiUsageResponse })
  async getApiUsage(
    @Param() params: AdminOrgIdParam,
    @Query() query: AdminActivityQuery,
  ): Promise<AdminApiUsageResponse> {
    return this.service.getApiUsage(params.id, query.from, query.to);
  }

  @Get('users')
  @ApiOperation({
    summary:
      'Search every user on the platform (substring against email + display name + first/last). Limited result set; meant to back the impersonation picker.',
  })
  @ApiOkResponse({ type: AdminUserListResponse })
  async listUsers(@Query() query: AdminUserSearchQuery): Promise<AdminUserListResponse> {
    return this.service.listUsers(query.q);
  }

  @Post('impersonate')
  @ApiOperation({
    summary:
      'Mint a session for the target user with an `imp` claim pointing at the calling admin. The client swaps its stored tokens in to "act as" the user; the impersonation banner reads from `imp` to surface this.',
  })
  @ApiOkResponse({ type: AuthSessionResponse })
  async impersonate(
    @Req() req: Request & { user: AuthUser },
    @Body() dto: ImpersonateDto,
  ): Promise<AuthSessionResponse> {
    return this.service.impersonate(req, dto.userId);
  }
}
