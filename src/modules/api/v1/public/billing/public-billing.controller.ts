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

import {
  CreateBillingPortalSessionBody,
  CreateCheckoutSessionBody,
  ListPublicProductsQuery,
  PublicClientIdParam,
} from './request.dto';
import { PublicBillingService } from './public-billing.service';
import {
  PublicBillingPortalSessionResponse,
  PublicBillingProductListResponse,
  PublicCheckoutSessionResponse,
  PublicClientSubscriptionResponse,
} from './response.dto';

type PublicRequest = Request & { apiKey: ApiKeyContext };

/**
 * Read + transactional billing surface exposed to third-party apps. Pairs with
 * the admin controller in `organisations/billing/`. The product/price catalogue
 * is read-only here; mutations live behind owner/admin JWT auth on the admin
 * controller.
 */
@ApiTags('Public')
@ApiSecurity('apiKey')
@Controller('public')
export class PublicBillingController {
  constructor(private readonly service: PublicBillingService) {}

  @Get('products')
  @PublicApiRoute('billing:read')
  @ApiOperation({
    summary:
      "List the organisation's billable products with their prices. Active-only by default; pass includeInactive=true to include archived entries.",
  })
  @ApiOkResponse({ type: PublicBillingProductListResponse })
  async listProducts(
    @Req() req: PublicRequest,
    @Query() query: ListPublicProductsQuery,
  ): Promise<PublicBillingProductListResponse> {
    return this.service.listProducts(req.apiKey.organisationId, query);
  }

  @Post('clients/:id/checkout-session')
  @PublicApiRoute('billing:write')
  @ApiOperation({
    summary:
      "Create a Stripe Checkout Session for a client. The response includes a hosted URL — redirect the client's browser there to complete payment.",
  })
  @ApiCreatedResponse({ type: PublicCheckoutSessionResponse })
  async createCheckoutSession(
    @Req() req: PublicRequest,
    @Param() params: PublicClientIdParam,
    @Body() body: CreateCheckoutSessionBody,
  ): Promise<PublicCheckoutSessionResponse> {
    return this.service.createCheckoutSession(req.apiKey.organisationId, params.id, body);
  }

  @Post('clients/:id/billing-portal-session')
  @PublicApiRoute('billing:write')
  @ApiOperation({
    summary:
      "Open the Stripe Customer Portal for a client. Clients can update their payment method, view invoices, or cancel from there.",
  })
  @ApiCreatedResponse({ type: PublicBillingPortalSessionResponse })
  async createBillingPortalSession(
    @Req() req: PublicRequest,
    @Param() params: PublicClientIdParam,
    @Body() body: CreateBillingPortalSessionBody,
  ): Promise<PublicBillingPortalSessionResponse> {
    return this.service.createBillingPortalSession(req.apiKey.organisationId, params.id, body);
  }

  @Get('clients/:id/subscription')
  @PublicApiRoute('billing:read')
  @ApiOperation({
    summary:
      "Get the client's current active subscription, or { data: null } if they don't have one.",
  })
  @ApiOkResponse({ type: PublicClientSubscriptionResponse })
  async getSubscription(
    @Req() req: PublicRequest,
    @Param() params: PublicClientIdParam,
  ): Promise<PublicClientSubscriptionResponse> {
    return this.service.getClientSubscription(req.apiKey.organisationId, params.id);
  }
}
