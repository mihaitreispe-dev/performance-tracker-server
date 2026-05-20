import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { BillingApiService } from './billing-api.service';
import {
  CreateCouponDto,
  CreatePriceDto,
  CreateProductDto,
  CreateRefundDto,
  OrgIdCouponIdParams,
  OrgIdPriceIdParams,
  OrgIdProductIdParams,
  StartConnectOnboardingDto,
  UpdateConnectAccountDto,
} from './request.dto';
import {
  BillingCouponListResponse,
  BillingCouponResponse,
  BillingPriceListResponse,
  BillingPriceResponse,
  BillingProductListResponse,
  BillingProductResponse,
  BillingSubscriptionListResponse,
  ConnectAccountResponse,
  LoginLinkResponse,
  OnboardingLinkResponse,
  RefundResponse,
} from './response.dto';

/**
 * Admin billing surface for an organisation. All routes are owner/admin-gated
 * inside the service; the controller just wires JWT auth + Swagger metadata.
 *
 * Connect onboarding kicks off via POST /onboarding (returns a hosted Stripe URL).
 * Catalogue + coupons + refunds + subscription read endpoints live underneath.
 * `getAccount` may return `{ data: null }` when no Connect account has been
 * provisioned yet — clients should treat that as the "not connected" state.
 */
@ApiTags('Organisations')
@ApiBearerAuth()
@Controller('organisations/:id/billing')
@UseGuards(JwtAuthGuard)
export class BillingApiController {
  constructor(private readonly service: BillingApiService) {}

  // ---------- Connect onboarding ----------

  @Get('account')
  @ApiOperation({
    summary:
      "Get the organisation's Stripe Connect account state. Returns { data: null } if onboarding hasn't started.",
  })
  @ApiOkResponse({ type: ConnectAccountResponse })
  async getAccount(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
  ): Promise<ConnectAccountResponse | { data: null }> {
    return this.service.getAccount(req, params.id);
  }

  @Post('onboarding')
  @ApiOperation({
    summary:
      'Start (or resume) Stripe Express onboarding. Returns a single-use hosted URL the admin should be redirected to.',
  })
  @ApiCreatedResponse({ type: OnboardingLinkResponse })
  async startOnboarding(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: StartConnectOnboardingDto,
  ): Promise<OnboardingLinkResponse> {
    return this.service.startOnboarding(req, params.id, dto);
  }

  @Post('account/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Force a pull of capability flags from Stripe (charges_enabled, payouts_enabled, details_submitted). Use after onboarding completes.',
  })
  @ApiOkResponse({ type: ConnectAccountResponse })
  async refreshAccount(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
  ): Promise<ConnectAccountResponse> {
    return this.service.refreshAccount(req, params.id);
  }

  @Patch('account')
  @ApiOperation({
    summary:
      "Update the organisation's billing account settings (currently just the platform fee).",
  })
  @ApiOkResponse({ type: ConnectAccountResponse })
  async updateAccount(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: UpdateConnectAccountDto,
  ): Promise<ConnectAccountResponse> {
    return this.service.updateAccountFee(req, params.id, dto);
  }

  @Post('account/login-link')
  @ApiOperation({
    summary:
      "Mint a single-use URL into the admin's Stripe Express dashboard (for viewing payouts, KYC, etc.).",
  })
  @ApiCreatedResponse({ type: LoginLinkResponse })
  async createLoginLink(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
  ): Promise<LoginLinkResponse> {
    return this.service.createDashboardLoginLink(req, params.id);
  }

  // ---------- Products ----------

  @Get('products')
  @ApiOperation({ summary: 'List products in the organisation catalogue.' })
  @ApiOkResponse({ type: BillingProductListResponse })
  async listProducts(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
  ): Promise<BillingProductListResponse> {
    return this.service.listProducts(req, params.id);
  }

  @Post('products')
  @ApiOperation({
    summary:
      "Create a product on the org's Stripe connected account and mirror it locally.",
  })
  @ApiCreatedResponse({ type: BillingProductResponse })
  async createProduct(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: CreateProductDto,
  ): Promise<BillingProductResponse> {
    return this.service.createProduct(req, params.id, dto);
  }

  @Delete('products/:productId')
  @ApiOperation({
    summary:
      "Archive a product (sets Stripe's active=false). Existing subscriptions keep running; new checkouts are blocked.",
  })
  @ApiOkResponse({ type: BillingProductResponse })
  async archiveProduct(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrgIdProductIdParams,
  ): Promise<BillingProductResponse> {
    return this.service.archiveProduct(req, params.id, params.productId);
  }

  // ---------- Prices ----------

  @Get('prices')
  @ApiOperation({
    summary:
      'List prices in the catalogue. Optionally filter by `productId` (the Stripe product id, not the local uuid).',
  })
  @ApiOkResponse({ type: BillingPriceListResponse })
  async listPrices(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Query('productId') productId?: string,
  ): Promise<BillingPriceListResponse> {
    return this.service.listPrices(req, params.id, productId);
  }

  @Post('prices')
  @ApiOperation({
    summary:
      'Create a recurring price for an existing product. Supports month/year billing with optional trial.',
  })
  @ApiCreatedResponse({ type: BillingPriceResponse })
  async createPrice(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: CreatePriceDto,
  ): Promise<BillingPriceResponse> {
    return this.service.createPrice(req, params.id, dto);
  }

  @Delete('prices/:priceId')
  @ApiOperation({
    summary:
      'Archive a price (Stripe disallows mutation, only archive). Pass the local price uuid.',
  })
  @ApiOkResponse({ type: BillingPriceResponse })
  async archivePrice(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrgIdPriceIdParams,
  ): Promise<BillingPriceResponse> {
    return this.service.archivePrice(req, params.id, params.priceId);
  }

  // ---------- Coupons ----------

  @Get('coupons')
  @ApiOperation({ summary: 'List coupons + promotion codes for the organisation.' })
  @ApiOkResponse({ type: BillingCouponListResponse })
  async listCoupons(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
  ): Promise<BillingCouponListResponse> {
    return this.service.listCoupons(req, params.id);
  }

  @Post('coupons')
  @ApiOperation({
    summary:
      'Create a coupon (percent or amount off). Pass `code` to also mint a customer-typeable promotion code.',
  })
  @ApiCreatedResponse({ type: BillingCouponResponse })
  async createCoupon(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: CreateCouponDto,
  ): Promise<BillingCouponResponse> {
    return this.service.createCoupon(req, params.id, dto);
  }

  @Delete('coupons/:couponId')
  @ApiOperation({
    summary:
      "Delete a coupon on Stripe and deactivate the local mirror. Existing subscriptions keep the discount they've already received.",
  })
  @ApiOkResponse({ type: BillingCouponResponse })
  async deleteCoupon(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrgIdCouponIdParams,
  ): Promise<BillingCouponResponse> {
    return this.service.deleteCoupon(req, params.id, params.couponId);
  }

  // ---------- Subscriptions ----------

  @Get('subscriptions')
  @ApiOperation({
    summary:
      'List subscriptions for the organisation (read straight from the local mirror, kept in sync via webhooks).',
  })
  @ApiOkResponse({ type: BillingSubscriptionListResponse })
  async listSubscriptions(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
  ): Promise<BillingSubscriptionListResponse> {
    return this.service.listSubscriptions(req, params.id);
  }

  // ---------- Refunds ----------

  @Post('refunds')
  @ApiOperation({
    summary:
      "Refund a charge on a customer's PaymentIntent. Omit `amount` for a full refund.",
  })
  @ApiCreatedResponse({ type: RefundResponse })
  async createRefund(
    @Req() req: Request & { user: AuthUser },
    @Param() params: OrganisationIdParam,
    @Body() dto: CreateRefundDto,
  ): Promise<RefundResponse> {
    return this.service.createRefund(req, params.id, dto);
  }
}
