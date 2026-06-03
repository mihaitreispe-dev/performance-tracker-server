import { Body, Controller, Delete, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import type { AuthUser } from 'src/modules/auth/types/authenticated-user';
import type { ActiveOrgContext } from 'src/modules/auth/guards/active-org.guard';

import { MeApiService } from './me-api.service';
import { ListFeaturedContentQuery, RegisterDeviceTokenBody } from './request.dto';
import {
  DeviceTokenAckResponse,
  FeaturedContentResponse,
  MyEntitlementsResponse,
} from './response.dto';

type AuthedReq = Request & { user: AuthUser; activeOrg?: ActiveOrgContext };

/**
 * The "me" surface. JWT-authenticated, X-Organisation-Id header scoped.
 * Shared by our first-party athlete app and third-party client apps
 * built on OAuth (rehabit and similar).
 *
 * Distinct from /v1/auth/user (which returns the user record) and
 * /v1/organisations/me (which lists the user's orgs) — those existed
 * before. This controller covers the per-org "what does this user
 * have access to / what's featured / where do I push notifications"
 * surface that didn't have a natural home.
 */
@ApiTags('Me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeApiController {
  constructor(private readonly service: MeApiService) {}

  // -------- Entitlements ----------------------------------------------------

  @Get('entitlements')
  @ApiOperation({
    summary:
      'Aggregate roll-up of products this user owns + the per-kind list of resource ids those products unlock.',
  })
  @ApiOkResponse({ type: MyEntitlementsResponse })
  async getEntitlements(@Req() req: AuthedReq): Promise<MyEntitlementsResponse> {
    return this.service.getEntitlements(req);
  }

  // -------- Featured content ------------------------------------------------

  @Get('featured-content')
  @ApiOperation({
    summary:
      'Featured workouts / courses / snacks / plans whose window covers NOW(). Each item is lock-stamped against the user.',
  })
  @ApiOkResponse({ type: FeaturedContentResponse })
  async listFeatured(
    @Req() req: AuthedReq,
    @Query() query: ListFeaturedContentQuery,
  ): Promise<FeaturedContentResponse> {
    return this.service.listFeatured(req, query);
  }

  // -------- FCM device-token register/unregister ----------------------------

  @Post('device-tokens')
  @ApiOperation({
    summary:
      'Register an FCM device token for push delivery. Idempotent — repeated calls with the same token return the same ack.',
  })
  @ApiCreatedResponse({ type: DeviceTokenAckResponse })
  async registerDeviceToken(
    @Req() req: AuthedReq,
    @Body() body: RegisterDeviceTokenBody,
  ): Promise<DeviceTokenAckResponse> {
    return this.service.registerDeviceToken(req, body);
  }

  @Delete('device-tokens')
  @ApiOperation({
    summary: 'Unregister an FCM device token (e.g. on sign-out from a device).',
  })
  @ApiOkResponse({ type: DeviceTokenAckResponse })
  async unregisterDeviceToken(
    @Req() req: AuthedReq,
    @Body() body: RegisterDeviceTokenBody,
  ): Promise<DeviceTokenAckResponse> {
    return this.service.unregisterDeviceToken(req, body);
  }
}
