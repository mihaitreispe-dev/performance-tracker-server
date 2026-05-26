import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { EntitlementsApiService } from './entitlements-api.service';
import { EntitlementResourceParams, ReplaceEntitlementsDto } from './request.dto';
import { EntitlementsListResponse } from './response.dto';

/**
 * Admin endpoints to gate workouts / snacks / courses behind a set of
 * subscription products. PUT is replace-all; the API never accepts
 * deltas. Clearing all gates = PUT with an empty array.
 *
 * Mounted under `/organisations/:id/resources/:resourceType/:resourceId/entitlements`
 * — one route shape for all three resource kinds, with the kind in the
 * URL so it's visible in logs and the swagger doc has a single entry
 * rather than three near-duplicates.
 */
@ApiTags('Organisations')
@ApiBearerAuth()
@Controller('organisations/:id/resources/:resourceType/:resourceId/entitlements')
@UseGuards(JwtAuthGuard)
export class EntitlementsApiController {
  constructor(private readonly service: EntitlementsApiService) {}

  @Get()
  @ApiOperation({
    summary:
      "List the subscription tiers that unlock a single resource. Empty `data` means the resource is free.",
  })
  @ApiOkResponse({ type: EntitlementsListResponse })
  async list(
    @Req() req: Request & { user: AuthUser },
    @Param() params: EntitlementResourceParams,
  ): Promise<EntitlementsListResponse> {
    return this.service.list(req, params.id, params.resourceType, params.resourceId);
  }

  @Put()
  @ApiOperation({
    summary:
      'Replace the tier set that unlocks a single resource. Any-of semantics — a client with an active subscription to any listed product gets access. Empty array clears the gate.',
  })
  @ApiOkResponse({ type: EntitlementsListResponse })
  async replace(
    @Req() req: Request & { user: AuthUser },
    @Param() params: EntitlementResourceParams,
    @Body() dto: ReplaceEntitlementsDto,
  ): Promise<EntitlementsListResponse> {
    return this.service.replace(
      req,
      params.id,
      params.resourceType,
      params.resourceId,
      dto.stripeProductIds,
    );
  }
}
