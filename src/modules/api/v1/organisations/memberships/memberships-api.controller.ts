import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RateLimit, RateLimitGuard, RateLimitPresets } from 'src/lib/guards/rate-limit.guard';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { OrganisationIdParam } from '../request.dto';
import { MembershipsApiService } from './memberships-api.service';
import { InviteMemberDto, MembershipIdParams, UpdateMembershipRoleDto } from './request.dto';
import { MembershipResponse, MembershipsListResponse } from './response.dto';

@ApiTags('Organisations')
@ApiBearerAuth()
@Controller('organisations/:id/memberships')
@UseGuards(JwtAuthGuard)
export class MembershipsApiController {
  constructor(private readonly membershipsService: MembershipsApiService) {}

  @Get()
  @ApiOperation({ summary: 'List members of an organisation' })
  @ApiOkResponse({ type: MembershipsListResponse })
  async listMembers(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
  ): Promise<MembershipsListResponse> {
    return this.membershipsService.listMembers(req, params.id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Invite an existing user into this organisation (coach/admin/owner — role-ceiling applies). Rate-limited per user.',
  })
  @ApiOkResponse({ type: MembershipResponse })
  // Per-user rate limit: 20 invites per hour. Stops a compromised
  // coach account from being used to mass-invite spam, and keeps
  // honest mistake rate within reason ("did my click register?
  // let me click it 50 more times"). Pre-existing OWNER/ADMIN
  // accounts don't escape the limit — same bucket. Platform admins
  // are intentionally NOT exempted; if a support engineer is
  // moving more than 20 users an hour in one org they should be
  // using a different tool.
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimitPresets.INVITE_MEMBER)
  async inviteMember(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: InviteMemberDto,
  ): Promise<MembershipResponse> {
    return this.membershipsService.inviteMember(req, params.id, dto);
  }

  @Patch(':membershipId')
  @ApiOperation({ summary: 'Change a member\'s role (admin/owner only)' })
  @ApiOkResponse({ type: MembershipResponse })
  async updateRole(
    @Req() req: Request & { user: AuthUser },
    @Param() params: MembershipIdParams,
    @Body() dto: UpdateMembershipRoleDto,
  ): Promise<MembershipResponse> {
    return this.membershipsService.updateRole(req, params.id, params.membershipId, dto);
  }

  @Post(':membershipId/accept')
  @SkipActiveOrg()
  @ApiOperation({ summary: 'Accept a pending invitation (the invitee only)' })
  @ApiOkResponse({ type: MembershipResponse })
  async acceptInvitation(
    @Req() req: Request & { user: AuthUser },
    @Param() params: MembershipIdParams,
  ): Promise<MembershipResponse> {
    return this.membershipsService.acceptInvitation(req, params.id, params.membershipId);
  }

  @Delete(':membershipId')
  @ApiOperation({ summary: 'Remove a member (admin/owner only)' })
  @ApiNoContentResponse()
  async removeMember(
    @Req() req: Request & { user: AuthUser },
    @Param() params: MembershipIdParams,
  ): Promise<void> {
    return this.membershipsService.removeMember(req, params.id, params.membershipId);
  }

  @Post('leave')
  @SkipActiveOrg()
  @ApiOperation({
    summary: "Leave the organisation (self-service). Owners must hand off ownership first.",
  })
  @ApiNoContentResponse()
  async leaveOrganisation(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
  ): Promise<void> {
    return this.membershipsService.leaveOrganisation(req, params.id);
  }
}
