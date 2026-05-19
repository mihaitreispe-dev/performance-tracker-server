import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import type { ApiKeyContext } from 'src/modules/auth/api-key/api-key.guard';
import { PublicApiRoute } from 'src/modules/auth/api-key/public-api-route.decorator';

import { PublicClientsService } from './public-clients.service';
import {
  CreatePublicClientBody,
  ListPublicClientsQuery,
  PublicClientIdParam,
} from './request.dto';
import {
  PublicClientListResponse,
  PublicClientResponse,
} from './response.dto';

type PublicRequest = Request & { apiKey: ApiKeyContext };

@ApiTags('Public')
@ApiSecurity('apiKey')
@Controller('public/clients')
export class PublicClientsController {
  constructor(private readonly service: PublicClientsService) {}

  @Post()
  @PublicApiRoute('clients:create')
  @ApiOperation({
    summary:
      'Upsert a client (athlete) into the organisation. Idempotent by email — repeat calls merge metadata. Until the user claims their account through the hosted auth flow, pendingClaim=true.',
  })
  @ApiCreatedResponse({ type: PublicClientResponse })
  async upsert(
    @Req() req: PublicRequest,
    @Body() body: CreatePublicClientBody,
  ): Promise<PublicClientResponse> {
    return this.service.upsert(req.apiKey.organisationId, body);
  }

  @Get()
  @PublicApiRoute('clients:read')
  @ApiOperation({
    summary:
      'List the organisation\'s clients (athletes). Supports pagination and a JSONB metadata equality filter.',
  })
  @ApiOkResponse({ type: PublicClientListResponse })
  async list(
    @Req() req: PublicRequest,
    @Query() query: ListPublicClientsQuery,
  ): Promise<PublicClientListResponse> {
    return this.service.list(req.apiKey.organisationId, query);
  }

  @Get(':id')
  @PublicApiRoute('clients:read')
  @ApiOperation({ summary: 'Fetch a single client by user id.' })
  @ApiOkResponse({ type: PublicClientResponse })
  async getById(
    @Req() req: PublicRequest,
    @Param() params: PublicClientIdParam,
  ): Promise<PublicClientResponse> {
    return this.service.getById(req.apiKey.organisationId, params.id);
  }
}
