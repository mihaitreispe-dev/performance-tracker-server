import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { ClientType } from 'src/database/interfaces';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { OrganisationIdParam } from '../request.dto';
import { ClientProfilesApiService } from './client-profiles-api.service';
import { UpdateClientTypeProfileDto } from './request.dto';
import {
  ClientTypeProfileResponse,
  ClientTypeProfilesListResponse,
} from './response.dto';

/**
 * Owner/admin-gated endpoints for the per-org default module profiles applied
 * at athlete provisioning. Sits next to BillingApiController under
 * /v1/organisations/:id/*.
 */
@ApiTags('Organisations')
@ApiBearerAuth()
@Controller('organisations/:id/client-profiles')
@UseGuards(JwtAuthGuard)
export class ClientProfilesApiController {
  constructor(private readonly service: ClientProfilesApiService) {}

  @Get()
  @ApiOperation({ summary: 'List both default client-type profiles (general + athlete).' })
  @ApiOkResponse({ type: ClientTypeProfilesListResponse })
  async list(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
  ): Promise<ClientTypeProfilesListResponse> {
    return this.service.listProfiles(req, params.id);
  }

  @Get(':clientType')
  @ApiOperation({ summary: 'Get a single default profile.' })
  @ApiParam({ name: 'clientType', enum: ClientType })
  @ApiOkResponse({ type: ClientTypeProfileResponse })
  async get(
    @Req() req: Request & { user: AuthUser },
    @Param('id') id: string,
    @Param('clientType') clientType: ClientType,
  ): Promise<ClientTypeProfileResponse> {
    return this.service.getProfile(req, id, clientType);
  }

  @Put(':clientType')
  @ApiOperation({
    summary:
      'Replace the per-type module toggle set. Modules omitted from the body are removed from the per-type overrides (fall back to org-wide setting).',
  })
  @ApiParam({ name: 'clientType', enum: ClientType })
  @ApiOkResponse({ type: ClientTypeProfileResponse })
  async update(
    @Req() req: Request & { user: AuthUser },
    @Param('id') id: string,
    @Param('clientType') clientType: ClientType,
    @Body() dto: UpdateClientTypeProfileDto,
  ): Promise<ClientTypeProfileResponse> {
    return this.service.updateProfile(req, id, clientType, dto);
  }
}
