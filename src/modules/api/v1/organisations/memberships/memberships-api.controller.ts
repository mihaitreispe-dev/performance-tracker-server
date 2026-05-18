import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
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
  async listMembers(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
  ): Promise<MembershipsListResponse> {
    return this.membershipsService.listMembers(req, params.id);
  }

  @Post()
  @ApiOperation({ summary: 'Invite an existing user into this organisation (admin/owner only)' })
  async inviteMember(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: InviteMemberDto,
  ): Promise<MembershipResponse> {
    return this.membershipsService.inviteMember(req, params.id, dto);
  }

  @Patch(':membershipId')
  @ApiOperation({ summary: 'Change a member\'s role (admin/owner only)' })
  async updateRole(
    @Req() req: Request & { user: AuthUser },
    @Param() params: MembershipIdParams,
    @Body() dto: UpdateMembershipRoleDto,
  ): Promise<MembershipResponse> {
    return this.membershipsService.updateRole(req, params.id, params.membershipId, dto);
  }

  @Post(':membershipId/accept')
  @ApiOperation({ summary: 'Accept a pending invitation (the invitee only)' })
  async acceptInvitation(
    @Req() req: Request & { user: AuthUser },
    @Param() params: MembershipIdParams,
  ): Promise<MembershipResponse> {
    return this.membershipsService.acceptInvitation(req, params.id, params.membershipId);
  }

  @Delete(':membershipId')
  @ApiOperation({ summary: 'Remove a member (admin/owner only)' })
  async removeMember(
    @Req() req: Request & { user: AuthUser },
    @Param() params: MembershipIdParams,
  ): Promise<void> {
    return this.membershipsService.removeMember(req, params.id, params.membershipId);
  }
}
