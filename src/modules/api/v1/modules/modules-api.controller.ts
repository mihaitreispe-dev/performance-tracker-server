import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { OrganisationIdParam } from '../organisations/request.dto';
import { ModulesApiService } from './modules-api.service';
import { ResolveModulesQuery, SetAthleteOverrideDto, SetOrgModuleDto } from './request.dto';
import { ModulesListResponse, OkResponse, ResolvedModulesResponse } from './response.dto';

class AthleteOverrideTargetParams extends OrganisationIdParam {
  @ApiProperty()
  @IsUUID()
  athleteUserId: string;

  @ApiProperty()
  moduleKey: string;
}

@ApiTags('Modules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('organisations/:id/modules')
export class ModulesApiController {
  constructor(private readonly modulesService: ModulesApiService) {}

  @Get('catalogue')
  @ApiOperation({ summary: 'List the module catalogue (the same for all orgs)' })
  @ApiOkResponse({ type: ModulesListResponse })
  async listCatalogue(): Promise<ModulesListResponse> {
    return this.modulesService.listCatalogue();
  }

  @Get('resolved')
  @ApiOperation({ summary: 'Resolve which modules are enabled for an org (and optionally an athlete)' })
  @ApiOkResponse({ type: ResolvedModulesResponse })
  async resolve(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Query() query: ResolveModulesQuery,
  ): Promise<ResolvedModulesResponse> {
    return this.modulesService.resolveModules(req, params.id, query.athleteId);
  }

  @Post('org-settings')
  @ApiOperation({ summary: 'Set the org-level enabled state for a module (admin/owner)' })
  @ApiOkResponse({ type: OkResponse })
  async setOrgModule(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: SetOrgModuleDto,
  ): Promise<{ ok: true }> {
    return this.modulesService.setOrgModule(req, params.id, dto);
  }

  @Post('athlete-overrides')
  @ApiOperation({ summary: 'Set a per-athlete override for a module (coach or above)' })
  @ApiOkResponse({ type: OkResponse })
  async setAthleteOverride(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: SetAthleteOverrideDto,
  ): Promise<{ ok: true }> {
    return this.modulesService.setAthleteOverride(req, params.id, dto);
  }

  @Delete('athlete-overrides/:athleteUserId/:moduleKey')
  @ApiOperation({ summary: 'Clear a per-athlete override so the org default applies again' })
  @ApiOkResponse({ type: OkResponse })
  async clearAthleteOverride(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteOverrideTargetParams,
  ): Promise<{ ok: true }> {
    return this.modulesService.clearAthleteOverride(req, params.id, params.athleteUserId, params.moduleKey);
  }
}
