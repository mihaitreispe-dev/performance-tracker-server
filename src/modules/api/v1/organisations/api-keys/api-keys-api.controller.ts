import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { OrganisationIdParam } from '../request.dto';
import { ApiKeysApiService } from './api-keys-api.service';
import { ApiKeyIdParams, CreateApiKeyDto } from './request.dto';
import {
  ApiKeyListResponse,
  ApiKeyResponse,
  ApiKeyUsageResponse,
  CreatedApiKeyResponse,
} from './response.dto';

@ApiTags('Organisations')
@ApiBearerAuth()
@Controller('organisations/:id/api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysApiController {
  constructor(private readonly service: ApiKeysApiService) {}

  @Get()
  @ApiOperation({ summary: 'List API keys for an organisation (owner/admin only)' })
  @ApiOkResponse({ type: ApiKeyListResponse })
  async list(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
  ): Promise<ApiKeyListResponse> {
    return this.service.list(req, params.id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a new API key (owner/admin only). The response includes the full key — copy it immediately, it cannot be retrieved later.',
  })
  @ApiCreatedResponse({ type: CreatedApiKeyResponse })
  async create(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreatedApiKeyResponse> {
    return this.service.create(req, params.id, dto);
  }

  @Delete(':keyId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an API key (owner/admin only). Idempotent.' })
  @ApiOkResponse({ type: ApiKeyResponse })
  async revoke(
    @Req() req: Request & { user: AuthUser },
    @Param() params: ApiKeyIdParams,
  ): Promise<ApiKeyResponse> {
    return this.service.revoke(req, params.id, params.keyId);
  }

  @Get('usage')
  @ApiOperation({
    summary:
      'Daily usage rollup for the API keys of an organisation. Returns up to the last 90 days; defaults to 30.',
  })
  @ApiOkResponse({ type: ApiKeyUsageResponse })
  async usage(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Query('days') daysParam?: string,
  ): Promise<ApiKeyUsageResponse> {
    const days = daysParam ? Number.parseInt(daysParam, 10) : 30;
    return this.service.usage(req, params.id, Number.isFinite(days) ? days : 30);
  }
}
