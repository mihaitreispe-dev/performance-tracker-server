import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
// The `stripe` package's CJS d.ts collapses the class+namespace merge into a
// `StripeConstructor` shell, so neither `import Stripe from 'stripe'` nor
// `import { Stripe } from 'stripe'` preserves namespace-typed responses under
// our TS config. We use `import = require` to keep both the callable
// constructor and the response types accessible — and *don't* annotate the
// method return types explicitly. Callers get inferred Stripe types, which is
// what we'd want anyway since the SDK's own types are authoritative.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Stripe = require('stripe');

import { AppConfigService } from 'src/modules/config/app-config.service';

/**
 * Thin wrapper around the Stripe Node SDK.
 *
 *   - One platform-keyed `Stripe` client (the platform owns the secret).
 *   - Every Connect-targeted call accepts a `stripeAccountId` and routes via
 *     `{ stripeAccount }` so charges/subs land on the connected account, not
 *     the platform.
 *   - All methods throw `ServiceUnavailableException` if the secret key isn't
 *     configured — keeps the rest of the codebase from having to null-check.
 *
 * Higher-level orchestration (per-(org, user) customers, upserting our local
 * mirrors, etc.) lives in BillingApiService; this file is purely the Stripe
 * API surface.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: InstanceType<typeof Stripe> | null;

  constructor(private readonly configService: AppConfigService) {
    const key = this.configService.stripeSecretKey;
    if (!key) {
      this.logger.warn(
        'STRIPE_SECRET_KEY is not configured. Billing endpoints will fail with 503 until it is set.',
      );
      this.client = null;
    } else {
      // No `apiVersion` pin — let the SDK use its bundled version so we don't
      // have to chase API version strings across SDK upgrades.
      this.client = new Stripe(key);
    }
  }

  private requireClient() {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Stripe is not configured on this deployment (set STRIPE_SECRET_KEY).',
      );
    }
    return this.client;
  }

  /** Webhook signature verification, called from the webhook controller. */
  constructEvent(payload: string | Buffer, signature: string, secret: string) {
    return this.requireClient().webhooks.constructEvent(payload, signature, secret);
  }

  // ---------- Connect onboarding ----------

  async createConnectAccount(opts: { country?: string; email?: string }) {
    return this.requireClient().accounts.create({
      type: 'express',
      country: opts.country,
      email: opts.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
  }

  async createAccountLink(opts: {
    stripeAccountId: string;
    refreshUrl: string;
    returnUrl: string;
  }) {
    return this.requireClient().accountLinks.create({
      account: opts.stripeAccountId,
      refresh_url: opts.refreshUrl,
      return_url: opts.returnUrl,
      type: 'account_onboarding',
    });
  }

  async retrieveAccount(stripeAccountId: string) {
    return this.requireClient().accounts.retrieve(stripeAccountId);
  }

  async createLoginLink(stripeAccountId: string) {
    return this.requireClient().accounts.createLoginLink(stripeAccountId);
  }

  // ---------- Customers (per (org, user)) ----------

  async createCustomer(
    stripeAccountId: string,
    opts: { email?: string; name?: string; metadata?: Record<string, string> },
  ) {
    return this.requireClient().customers.create(
      { email: opts.email, name: opts.name, metadata: opts.metadata },
      { stripeAccount: stripeAccountId },
    );
  }

  // ---------- Products + prices ----------

  async createProduct(
    stripeAccountId: string,
    opts: { name: string; description?: string },
  ) {
    return this.requireClient().products.create(
      { name: opts.name, description: opts.description },
      { stripeAccount: stripeAccountId },
    );
  }

  async archiveProduct(stripeAccountId: string, stripeProductId: string) {
    return this.requireClient().products.update(
      stripeProductId,
      { active: false },
      { stripeAccount: stripeAccountId },
    );
  }

  async createPrice(
    stripeAccountId: string,
    opts: {
      productId: string;
      currency: string;
      unitAmount: number;
      interval: 'month' | 'year';
      intervalCount?: number;
      trialPeriodDays?: number;
      nickname?: string;
    },
  ) {
    return this.requireClient().prices.create(
      {
        product: opts.productId,
        currency: opts.currency,
        unit_amount: opts.unitAmount,
        recurring: {
          interval: opts.interval,
          interval_count: opts.intervalCount ?? 1,
          ...(opts.trialPeriodDays ? { trial_period_days: opts.trialPeriodDays } : {}),
        },
        nickname: opts.nickname,
      },
      { stripeAccount: stripeAccountId },
    );
  }

  async archivePrice(stripeAccountId: string, stripePriceId: string) {
    return this.requireClient().prices.update(
      stripePriceId,
      { active: false },
      { stripeAccount: stripeAccountId },
    );
  }

  // ---------- Checkout + portal ----------

  async createCheckoutSession(
    stripeAccountId: string,
    opts: {
      customerId: string;
      priceId: string;
      successUrl: string;
      cancelUrl: string;
      /** As percent — e.g. 5 = 5%. We convert from the per-org bps at the call site. */
      applicationFeePercent: number;
      /** Promotion code id, if the user supplied one. */
      promotionCodeId?: string;
    },
  ) {
    return this.requireClient().checkout.sessions.create(
      {
        mode: 'subscription',
        customer: opts.customerId,
        line_items: [{ price: opts.priceId, quantity: 1 }],
        success_url: opts.successUrl,
        cancel_url: opts.cancelUrl,
        // Stripe Tax kicks in for jurisdictions the connected account has
        // configured. If they haven't, Stripe still creates the session — it
        // just won't add tax.
        automatic_tax: { enabled: true },
        subscription_data: { application_fee_percent: opts.applicationFeePercent },
        ...(opts.promotionCodeId
          ? { discounts: [{ promotion_code: opts.promotionCodeId }] }
          : { allow_promotion_codes: true }),
      },
      { stripeAccount: stripeAccountId },
    );
  }

  async createBillingPortalSession(
    stripeAccountId: string,
    opts: { customerId: string; returnUrl: string },
  ) {
    return this.requireClient().billingPortal.sessions.create(
      { customer: opts.customerId, return_url: opts.returnUrl },
      { stripeAccount: stripeAccountId },
    );
  }

  // ---------- Coupons + promotion codes ----------

  async createCoupon(
    stripeAccountId: string,
    opts: {
      percentOff?: number;
      amountOff?: number;
      currency?: string;
      duration: 'once' | 'repeating' | 'forever';
      durationInMonths?: number;
      maxRedemptions?: number;
      redeemBy?: number; // unix seconds
      name?: string;
    },
  ) {
    return this.requireClient().coupons.create(
      {
        percent_off: opts.percentOff,
        amount_off: opts.amountOff,
        currency: opts.currency,
        duration: opts.duration,
        duration_in_months: opts.durationInMonths,
        max_redemptions: opts.maxRedemptions,
        redeem_by: opts.redeemBy,
        name: opts.name,
      },
      { stripeAccount: stripeAccountId },
    );
  }

  async createPromotionCode(
    stripeAccountId: string,
    opts: { couponId: string; code?: string },
  ) {
    return this.requireClient().promotionCodes.create(
      {
        // Stripe v22 nests the coupon under a `promotion` discriminator. v21
        // accepted a flat `coupon` field; both forms compile against the typed
        // SDK only in the wrapped object shape.
        promotion: { type: 'coupon', coupon: opts.couponId },
        code: opts.code,
      },
      { stripeAccount: stripeAccountId },
    );
  }

  async deleteCoupon(stripeAccountId: string, couponId: string) {
    return this.requireClient().coupons.del(couponId, { stripeAccount: stripeAccountId });
  }

  // ---------- Refunds ----------

  async createRefund(
    stripeAccountId: string,
    opts: {
      paymentIntentId: string;
      amount?: number;
      reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    },
  ) {
    return this.requireClient().refunds.create(
      {
        payment_intent: opts.paymentIntentId,
        amount: opts.amount,
        reason: opts.reason,
      },
      { stripeAccount: stripeAccountId },
    );
  }
}
