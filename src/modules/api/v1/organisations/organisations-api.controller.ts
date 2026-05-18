import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { OrganisationsApiService } from './organisations-api.service';
import {
  ConfirmLogoUploadDto,
  CreateOrganisationDto,
  OrganisationIdParam,
  RequestLogoUploadDto,
  UpdateOrganisationDto,
} from './request.dto';
import { LogoUploadResponse, MyOrganisationsListResponse, OrganisationResponse } from './response.dto';

@ApiTags('Organisations')
@ApiBearerAuth()
@Controller('organisations')
@UseGuards(JwtAuthGuard)
export class OrganisationsApiController {
  constructor(private readonly orgsService: OrganisationsApiService) {}

  @Post()
  @SkipActiveOrg()
  @ApiOperation({ summary: 'Create an organisation (self-serve). The caller becomes ORG_OWNER.' })
  async createOrganisation(
    @Req() req: Request & { user: AuthUser },
    @Body() dto: CreateOrganisationDto,
  ): Promise<OrganisationResponse> {
    return this.orgsService.createOrganisation(req, dto);
  }

  @Get('me')
  @SkipActiveOrg()
  @ApiOperation({ summary: 'List organisations the current user is a member of' })
  async listMyOrganisations(@Req() req: Request & { user: AuthUser }): Promise<MyOrganisationsListResponse> {
    return this.orgsService.listMyOrganisations(req);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single organisation by id (member-only)' })
  async getOrganisation(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
  ): Promise<OrganisationResponse> {
    return this.orgsService.getOrganisation(req, params.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update organisation metadata (owner/admin only)' })
  async updateOrganisation(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: UpdateOrganisationDto,
  ): Promise<OrganisationResponse> {
    return this.orgsService.updateOrganisation(req, params.id, dto);
  }

  @Post(':id/logo')
  @ApiOperation({
    summary: 'Request a presigned PUT URL to upload a new organisation logo (owner/admin only)',
  })
  async requestLogoUpload(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: RequestLogoUploadDto,
  ): Promise<LogoUploadResponse> {
    return this.orgsService.requestLogoUpload(req, params.id, dto);
  }

  @Post(':id/logo/complete')
  @ApiOperation({
    summary: 'Confirm the logo upload (verifies the S3 object, persists bucket/key on the org)',
  })
  async confirmLogoUpload(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: ConfirmLogoUploadDto,
  ): Promise<OrganisationResponse> {
    return this.orgsService.confirmLogoUpload(req, params.id, dto);
  }

  @Delete(':id/logo')
  @ApiOperation({ summary: 'Remove the organisation logo (owner/admin only)' })
  async clearLogo(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
  ): Promise<OrganisationResponse> {
    return this.orgsService.clearLogo(req, params.id);
  }
}
