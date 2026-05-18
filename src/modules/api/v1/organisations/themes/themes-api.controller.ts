import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { OrganisationIdParam } from '../request.dto';
import { UpdateThemeDto } from './request.dto';
import { ThemeResponse } from './response.dto';
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
}
