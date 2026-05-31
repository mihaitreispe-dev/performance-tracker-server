import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { AdminUserSearchQuery, ImpersonateDto } from './request.dto';
import { AdminOrganisationListResponse, AdminUserListResponse } from './response.dto';

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
