import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { OrganisationIdParam } from '../request.dto';
import { ConfirmFaviconUploadDto, RequestFaviconUploadDto, UpdateThemeDto } from './request.dto';
import { FaviconUploadResponse, ThemeResponse } from './response.dto';
import { ThemesApiService } from './themes-api.service';

@ApiTags('Organisations')
@ApiBearerAuth()
@Controller('organisations/:id/theme')
@UseGuards(JwtAuthGuard)
export class ThemesApiController {
  constructor(private readonly themesService: ThemesApiService) {}

  @Get()
  @ApiOperation({ summary: 'Fetch the active theme for an organisation (members only)' })
  async getTheme(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
  ): Promise<ThemeResponse> {
    return this.themesService.getTheme(req, params.id);
  }

  @Put()
  @ApiOperation({ summary: 'Upsert the theme for an organisation (admin/owner only)' })
  async updateTheme(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: UpdateThemeDto,
  ): Promise<ThemeResponse> {
    return this.themesService.updateTheme(req, params.id, dto);
  }

  @Post('favicon')
  @ApiOperation({ summary: 'Request a presigned PUT URL to upload a new favicon (owner/admin only)' })
  async requestFaviconUpload(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: RequestFaviconUploadDto,
  ): Promise<FaviconUploadResponse> {
    return this.themesService.requestFaviconUpload(req, params.id, dto);
  }

  @Post('favicon/complete')
  @ApiOperation({ summary: 'Confirm the favicon upload (verifies S3 object, persists bucket/key)' })
  async confirmFaviconUpload(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: ConfirmFaviconUploadDto,
  ): Promise<ThemeResponse> {
    return this.themesService.confirmFaviconUpload(req, params.id, dto);
  }

  @Delete('favicon')
  @ApiOperation({ summary: 'Remove the organisation favicon (owner/admin only)' })
  async clearFavicon(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
  ): Promise<ThemeResponse> {
    return this.themesService.clearFavicon(req, params.id);
  }
}
