import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';

import { OrganisationRole } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { StripeService } from 'src/modules/stripe/stripe.service';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { OrganisationRepository } from 'src/repositories/organisation.repository';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';

import {
  CreateCouponDto,
  CreatePriceDto,
  CreateProductDto,
  CreateRefundDto,
  StartConnectOnboardingDto,
  UpdateConnectAccountDto,
} from './request.dto';
import {
  BillingCouponDTO,
  BillingCouponListResponse,
  BillingCouponResponse,
  BillingPriceDTO,
  BillingPriceListResponse,
  BillingPriceResponse,
  BillingProductDTO,
  BillingProductListResponse,
  BillingProductResponse,
  BillingSubscriptionDTO,
  BillingSubscriptionListResponse,
  ConnectAccountDTO,
  ConnectAccountResponse,
  LoginLinkResponse,
  OnboardingLinkResponse,
  RefundResponse,
} from './response.dto';

const ADMIN_ROLES = [OrganisationRole.OWNER, OrganisationRole.ADMIN];

/**
 * Billing admin surface. JWT-authed; owner/admin only.
 *
 *   - Connect onboarding: creates an Express account for the org, hands back a
 *     hosted onboarding URL, refreshes our local capability mirror after the
 *     user comes back.
 *   - Catalogue: products + prices CRUD with a Stripe-first write pattern —
 *     we call Stripe, then mirror the resulting id locally. Stripe is the
 *     source of truth.
 *   - Coupons + (optionally) promotion codes for customer-typeable promo codes.
 *   - Refunds API: thin pass-through to Stripe with org-scoped guardrails.
 *   - Subscriptions list: read straight from the local mirror; the webhook
 *     handler keeps it in sync with Stripe.
 *
 * Every method starts with `ensureAdmin` to verify the caller owns/admins the
 * target org. `ensureConnected` additionally ensures the org has an active
 * Connect account before we try to call Stripe on its behalf.
 */
@Injectable()
export class BillingApiService {
  constructor(
    private readonly orgRepo: OrganisationRepository,
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly billingRepo: StripeBillingRepository,
    private readonly stripeService: StripeService,
    private readonly configService: AppConfigService,
  ) {}

  // ---------- Connect onboarding ----------

  async getAccount(
    req: Request & { user: AuthUser },
    orgId: string,
  ): Promise<ConnectAccountResponse | { data: null }> {
    await this.ensureAdmin(req.user.id, orgId);
    const row = await this.billingRepo.findAccountByOrg(orgId);
    if (!row) return { data: null };
    return { data: mapAccountDTO(row) };
  }

  async startOnboarding(
    req: Request & { user: AuthUser },
    orgId: string,
    dto: StartConnectOnboardingDto,
  ): Promise<OnboardingLinkResponse> {
    await this.ensureAdmin(req.user.id, orgId);
    const existing = await this.billingRepo.findAccountByOrg(orgId);

    // Reuse an existing account row if present (this is the "I started onboarding
    // but didn't finish" path). Otherwise mint a new Express account on Stripe.
    let stripeAccountId: string;
    if (existing) {
      stripeAccountId = existing.stripe_account_id;
    } else {
      const created = await this.stripeService.createConnectAccount({
        country: dto.country,
        email: dto.email,
      });
      await this.billingRepo.createAccount({
        organisation_id: orgId,
        stripe_account_id: created.id,
        default_currency: created.default_currency ?? null,
        country: created.country ?? null,
      });
      stripeAccountId = created.id;
    }

    const link = await this.stripeService.createAccountLink({
      stripeAccountId,
      // Stripe re-prompts with the same hosted form on `refresh_url`; we send
      // the user back to the same return URL the admin originally specified.
      refreshUrl: dto.returnUrl,
      returnUrl: dto.returnUrl,
    });
    return {
      data: {
        url: link.url,
        expiresAt: new Date(link.expires_at * 1000).toISOString(),
      },
    };
  }

  async refreshAccount(
    req: Request & { user: AuthUser },
    orgId: string,
  ): Promise<ConnectAccountResponse> {
    const account = await this.ensureConnected(req, orgId);
    const fresh = await this.stripeService.retrieveAccount(account.stripe_account_id);
    const updated = await this.billingRepo.updateAccount(orgId, {
      charges_enabled: !!fresh.charges_enabled,
      payouts_enabled: !!fresh.payouts_enabled,
      details_submitted: !!fresh.details_submitted,
      default_currency: fresh.default_currency ?? null,
      country: fresh.country ?? null,
    });
    return { data: mapAccountDTO(updated) };
  }

  async updateAccountFee(
    req: Request & { user: AuthUser },
    orgId: string,
    dto: UpdateConnectAccountDto,
  ): Promise<ConnectAccountResponse> {
    const account = await this.ensureConnected(req, orgId);
    const next = await this.billingRepo.updateAccount(orgId, {
      platform_fee_bps: dto.platformFeeBps ?? account.platform_fee_bps,
    });
    return { data: mapAccountDTO(next) };
  }

  async createDashboardLoginLink(
    req: Request & { user: AuthUser },
    orgId: string,
  ): Promise<LoginLinkResponse> {
    const account = await this.ensureConnected(req, orgId);
    const link = await this.stripeService.createLoginLink(account.stripe_account_id);
    return { data: { url: link.url } };
  }

  // ---------- Products + prices ----------

  async listProducts(
    req: Request & { user: AuthUser },
    orgId: string,
  ): Promise<BillingProductListResponse> {
    await this.ensureAdmin(req.user.id, orgId);
    const rows = await this.billingRepo.listProducts(orgId);
    return { data: rows.map(mapProductDTO) };
  }

  async createProduct(
    req: Request & { user: AuthUser },
    orgId: string,
    dto: CreateProductDto,
  ): Promise<BillingProductResponse> {
    const account = await this.ensureConnected(req, orgId);
    const stripeProduct = await this.stripeService.createProduct(account.stripe_account_id, {
      name: dto.name,
      description: dto.description,
    });
    const row = await this.billingRepo.createProduct({
      organisation_id: orgId,
      stripe_product_id: stripeProduct.id,
      name: dto.name,
      description: dto.description ?? null,
    });
    return { data: mapProductDTO(row) };
  }

  async archiveProduct(
    req: Request & { user: AuthUser },
    orgId: string,
    productId: string,
  ): Promise<BillingProductResponse> {
    const account = await this.ensureConnected(req, orgId);
    const local = await this.billingRepo.findProduct(orgId, productId);
    if (!local) throw new NotFoundException('Product not found in this organisation');
    await this.stripeService.archiveProduct(account.stripe_account_id, local.stripe_product_id);
    const updated = await this.billingRepo.updateProductByStripeId(local.stripe_product_id, {
      active: false,
    });
    return { data: mapProductDTO(updated ?? local) };
  }

  async listPrices(
    req: Request & { user: AuthUser },
    orgId: string,
    productStripeId?: string,
  ): Promise<BillingPriceListResponse> {
    await this.ensureAdmin(req.user.id, orgId);
    const rows = await this.billingRepo.listPrices(orgId, { productId: productStripeId });
    return { data: rows.map(mapPriceDTO) };
  }

  async createPrice(
    req: Request & { user: AuthUser },
    orgId: string,
    dto: CreatePriceDto,
  ): Promise<BillingPriceResponse> {
    const account = await this.ensureConnected(req, orgId);
    const product = await this.billingRepo.findProduct(orgId, dto.productId);
    if (!product) throw new NotFoundException('Product not found in this organisation');
    if (!product.active) {
      throw new BadRequestException('Cannot add a price to an archived product');
    }
    const stripePrice = await this.stripeService.createPrice(account.stripe_account_id, {
      productId: product.stripe_product_id,
      currency: dto.currency.toLowerCase(),
      unitAmount: dto.unitAmount,
      interval: dto.interval,
      intervalCount: dto.intervalCount,
      trialPeriodDays: dto.trialPeriodDays,
      nickname: dto.nickname,
    });
    const row = await this.billingRepo.createPrice({
      organisation_id: orgId,
      stripe_product_id: product.stripe_product_id,
      stripe_price_id: stripePrice.id,
      nickname: dto.nickname ?? null,
      currency: dto.currency.toLowerCase(),
      unit_amount: dto.unitAmount,
      interval: dto.interval,
      interval_count: dto.intervalCount ?? 1,
      trial_period_days: dto.trialPeriodDays ?? null,
    });
    return { data: mapPriceDTO(row) };
  }

  async archivePrice(
    req: Request & { user: AuthUser },
    orgId: string,
    priceId: string,
  ): Promise<BillingPriceResponse> {
    const account = await this.ensureConnected(req, orgId);
    const local = await this.billingRepo.findPrice(orgId, priceId);
    if (!local) throw new NotFoundException('Price not found in this organisation');
    await this.stripeService.archivePrice(account.stripe_account_id, local.stripe_price_id);
    const updated = await this.billingRepo.updatePriceByStripeId(local.stripe_price_id, {
      active: false,
    });
    return { data: mapPriceDTO(updated ?? local) };
  }

  // ---------- Coupons ----------

  async listCoupons(
    req: Request & { user: AuthUser },
    orgId: string,
  ): Promise<BillingCouponListResponse> {
    await this.ensureAdmin(req.user.id, orgId);
    const rows = await this.billingRepo.listCoupons(orgId);
    return { data: rows.map(mapCouponDTO) };
  }

  async createCoupon(
    req: Request & { user: AuthUser },
    orgId: string,
    dto: CreateCouponDto,
  ): Promise<BillingCouponResponse> {
    const account = await this.ensureConnected(req, orgId);
    // Stripe enforces exactly-one-of(percent_off, amount_off+currency); mirror that.
    if (!dto.percentOff === !dto.amountOff) {
      throw new BadRequestException('Provide exactly one of percentOff or amountOff.');
    }
    if (dto.amountOff && !dto.currency) {
      throw new BadRequestException('currency is required when amountOff is set.');
    }
    if (dto.duration === 'repeating' && !dto.durationInMonths) {
      throw new BadRequestException('durationInMonths is required when duration=repeating.');
    }

    const stripeCoupon = await this.stripeService.createCoupon(account.stripe_account_id, {
      percentOff: dto.percentOff,
      amountOff: dto.amountOff,
      currency: dto.currency?.toLowerCase(),
      duration: dto.duration,
      durationInMonths: dto.durationInMonths,
      maxRedemptions: dto.maxRedemptions,
      redeemBy: dto.redeemBy,
      name: dto.name,
    });

    // Mint a customer-facing promotion code if the org provided one. Lets the
    // checkout flow accept a typed code rather than the cryptic coupon id.
    let promotionCodeId: string | undefined;
    if (dto.code) {
      try {
        const promo = await this.stripeService.createPromotionCode(account.stripe_account_id, {
          couponId: stripeCoupon.id,
          code: dto.code,
        });
        promotionCodeId = promo.id;
      } catch (err) {
        if ((err as { code?: string })?.code === 'resource_already_exists') {
          throw new ConflictException(`Promotion code "${dto.code}" is already in use on this account.`);
        }
        throw err;
      }
    }

    const row = await this.billingRepo.createCoupon({
      organisation_id: orgId,
      stripe_coupon_id: stripeCoupon.id,
      stripe_promotion_code_id: promotionCodeId ?? null,
      code: dto.code ?? null,
      percent_off: dto.percentOff ?? null,
      amount_off: dto.amountOff ?? null,
      currency: dto.currency?.toLowerCase() ?? null,
      duration: dto.duration,
      duration_in_months: dto.durationInMonths ?? null,
      max_redemptions: dto.maxRedemptions ?? null,
      redeem_by: dto.redeemBy ? (new Date(dto.redeemBy * 1000) as never) : null,
    });
    return { data: mapCouponDTO(row) };
  }

  async deleteCoupon(
    req: Request & { user: AuthUser },
    orgId: string,
    couponId: string,
  ): Promise<BillingCouponResponse> {
    const account = await this.ensureConnected(req, orgId);
    const local = await this.billingRepo.findCoupon(orgId, couponId);
    if (!local) throw new NotFoundException('Coupon not found in this organisation');
    await this.stripeService.deleteCoupon(account.stripe_account_id, local.stripe_coupon_id);
    const next = await this.billingRepo.deactivateCoupon(orgId, couponId);
    return { data: mapCouponDTO(next) };
  }

  // ---------- Subscriptions ----------

  async listSubscriptions(
    req: Request & { user: AuthUser },
    orgId: string,
  ): Promise<BillingSubscriptionListResponse> {
    await this.ensureAdmin(req.user.id, orgId);
    const rows = await this.billingRepo.listSubscriptionsForOrg(orgId, { limit: 200 });
    return { data: rows.map(mapSubscriptionDTO) };
  }

  // ---------- Refunds ----------

  async createRefund(
    req: Request & { user: AuthUser },
    orgId: string,
    dto: CreateRefundDto,
  ): Promise<RefundResponse> {
    const account = await this.ensureConnected(req, orgId);
    const refund = await this.stripeService.createRefund(account.stripe_account_id, {
      paymentIntentId: dto.paymentIntentId,
      amount: dto.amount,
      reason: dto.reason,
    });
    return {
      data: {
        id: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status ?? 'unknown',
        reason: refund.reason ?? null,
      },
    };
  }

  // ---------- guards ----------

  private async ensureAdmin(userId: string, orgId: string): Promise<void> {
    const ok = await this.membershipRepo.hasRole(userId, orgId, ADMIN_ROLES);
    if (!ok) throw new ForbiddenException('Owner or admin role required for billing operations');
  }

  /** Resolves the connected account or throws — used by every Stripe-calling path. */
  private async ensureConnected(
    req: Request & { user: AuthUser },
    orgId: string,
  ) {
    await this.ensureAdmin(req.user.id, orgId);
    const account = await this.billingRepo.findAccountByOrg(orgId);
    if (!account) {
      throw new BadRequestException(
        'Stripe is not connected for this organisation. Call POST /v1/organisations/:id/billing/onboarding first.',
      );
    }
    return account;
  }
}

// ---------- mappers ----------

function mapAccountDTO(row: {
  organisation_id: string;
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  default_currency: string | null;
  country: string | null;
  platform_fee_bps: number;
}): ConnectAccountDTO {
  return {
    organisationId: row.organisation_id,
    stripeAccountId: row.stripe_account_id,
    chargesEnabled: row.charges_enabled,
    payoutsEnabled: row.payouts_enabled,
    detailsSubmitted: row.details_submitted,
    defaultCurrency: row.default_currency,
    country: row.country,
    platformFeeBps: row.platform_fee_bps,
  };
}

function mapProductDTO(row: {
  id: string;
  stripe_product_id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: unknown;
}): BillingProductDTO {
  return {
    id: row.id,
    stripeProductId: row.stripe_product_id,
    name: row.name,
    description: row.description,
    active: row.active,
    createdAt: isoOf(row.created_at),
  };
}

function mapPriceDTO(row: {
  id: string;
  stripe_product_id: string;
  stripe_price_id: string;
  nickname: string | null;
  currency: string;
  unit_amount: number;
  interval: string;
  interval_count: number;
  trial_period_days: number | null;
  active: boolean;
  created_at: unknown;
}): BillingPriceDTO {
  return {
    id: row.id,
    stripeProductId: row.stripe_product_id,
    stripePriceId: row.stripe_price_id,
    nickname: row.nickname,
    currency: row.currency,
    unitAmount: row.unit_amount,
    interval: row.interval,
    intervalCount: row.interval_count,
    trialPeriodDays: row.trial_period_days,
    active: row.active,
    createdAt: isoOf(row.created_at),
  };
}

function mapCouponDTO(row: {
  id: string;
  stripe_coupon_id: string;
  stripe_promotion_code_id: string | null;
  code: string | null;
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  duration: string;
  duration_in_months: number | null;
  max_redemptions: number | null;
  redeem_by: unknown;
  active: boolean;
  created_at: unknown;
}): BillingCouponDTO {
  return {
    id: row.id,
    stripeCouponId: row.stripe_coupon_id,
    stripePromotionCodeId: row.stripe_promotion_code_id,
    code: row.code,
    percentOff: row.percent_off,
    amountOff: row.amount_off,
    currency: row.currency,
    duration: row.duration,
    durationInMonths: row.duration_in_months,
    maxRedemptions: row.max_redemptions,
    redeemBy: row.redeem_by ? isoOf(row.redeem_by) : null,
    active: row.active,
    createdAt: isoOf(row.created_at),
  };
}

function mapSubscriptionDTO(row: {
  id: string;
  user_id: string | null;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  status: string;
  current_period_start: unknown;
  current_period_end: unknown;
  cancel_at_period_end: boolean;
  trial_end: unknown;
}): BillingSubscriptionDTO {
  return {
    id: row.id,
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripePriceId: row.stripe_price_id,
    status: row.status,
    currentPeriodStart: row.current_period_start ? isoOf(row.current_period_start) : null,
    currentPeriodEnd: row.current_period_end ? isoOf(row.current_period_end) : null,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    trialEnd: row.trial_end ? isoOf(row.trial_end) : null,
  };
}

function isoOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}
