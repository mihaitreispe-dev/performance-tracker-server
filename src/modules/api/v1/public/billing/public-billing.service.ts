import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { OrganisationRole } from 'src/database/interfaces';
import { StripeService } from 'src/modules/stripe/stripe.service';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';
import { UserRepository } from 'src/repositories/user.repository';

import {
  CreateBillingPortalSessionBody,
  CreateCheckoutSessionBody,
  ListPublicProductsQuery,
} from './request.dto';
import {
  PublicBillingPortalSessionResponse,
  PublicBillingProductListResponse,
  PublicCheckoutSessionResponse,
  PublicClientSubscriptionResponse,
} from './response.dto';

/**
 * Public-API billing surface. Same as the admin endpoints but key-scoped and
 * narrower:
 *
 *   - GET /products              — paid plans the org is selling (active by default)
 *   - POST /clients/:id/checkout-session   — open a Stripe Checkout for a client
 *   - POST /clients/:id/billing-portal-session — open the Stripe portal for a client
 *   - GET /clients/:id/subscription — current active sub, or `data: null`
 *
 * Required scopes:
 *   - billing:read   for product listing + subscription lookup
 *   - billing:write  for checkout-session and billing-portal-session
 *
 * Tenant boundary: api key gives us `organisationId`; every client lookup
 * additionally requires an OrganisationRole.ATHLETE membership in that org.
 */
@Injectable()
export class PublicBillingService {
  constructor(
    private readonly billingRepo: StripeBillingRepository,
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly userRepo: UserRepository,
    private readonly stripeService: StripeService,
  ) {}

  /** List active products + their active prices for the org's catalogue. */
  async listProducts(
    organisationId: string,
    query: ListPublicProductsQuery,
  ): Promise<PublicBillingProductListResponse> {
    const activeOnly = !query.includeInactive;
    const [products, prices] = await Promise.all([
      this.billingRepo.listProducts(organisationId, { activeOnly }),
      this.billingRepo.listPrices(organisationId, { activeOnly }),
    ]);
    // Bucket prices by product id once so the response build is O(n).
    const pricesByProduct = new Map<string, typeof prices>();
    for (const p of prices) {
      const arr = pricesByProduct.get(p.stripe_product_id) ?? [];
      arr.push(p);
      pricesByProduct.set(p.stripe_product_id, arr);
    }
    return {
      data: products.map((prod) => ({
        stripeProductId: prod.stripe_product_id,
        name: prod.name,
        description: prod.description,
        active: prod.active,
        prices: (pricesByProduct.get(prod.stripe_product_id) ?? []).map((pr) => ({
          stripePriceId: pr.stripe_price_id,
          nickname: pr.nickname,
          currency: pr.currency,
          unitAmount: pr.unit_amount,
          interval: pr.interval,
          intervalCount: pr.interval_count,
          trialPeriodDays: pr.trial_period_days,
          active: pr.active,
        })),
      })),
    };
  }

  /**
   * Open a Checkout Session for one of the org's clients. Lazily provisions a
   * Stripe Customer if this user doesn't have one in the org yet.
   *
   * The `application_fee_percent` is derived from the org's `platform_fee_bps`
   * (10000 = 100%, so the percent value passed to Stripe is bps/100).
   */
  async createCheckoutSession(
    organisationId: string,
    userId: string,
    body: CreateCheckoutSessionBody,
  ): Promise<PublicCheckoutSessionResponse> {
    const account = await this.requireConnectedAccount(organisationId);
    const price = await this.billingRepo.findPriceByStripeId(body.priceId);
    if (!price || price.organisation_id !== organisationId) {
      throw new NotFoundException('Price not found in this organisation');
    }
    if (!price.active) {
      throw new BadRequestException('Price is archived and cannot be used for new checkouts.');
    }

    await this.assertClientMembership(organisationId, userId);
    const customer = await this.getOrCreateCustomer(organisationId, account.stripe_account_id, userId);

    const session = await this.stripeService.createCheckoutSession(account.stripe_account_id, {
      customerId: customer.stripe_customer_id,
      priceId: price.stripe_price_id,
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
      applicationFeePercent: account.platform_fee_bps / 100,
      promotionCodeId: body.promotionCodeId,
    });

    if (!session.url) {
      throw new BadRequestException('Stripe did not return a Checkout URL — verify your Stripe account state.');
    }
    return { data: { id: session.id, url: session.url } };
  }

  async createBillingPortalSession(
    organisationId: string,
    userId: string,
    body: CreateBillingPortalSessionBody,
  ): Promise<PublicBillingPortalSessionResponse> {
    const account = await this.requireConnectedAccount(organisationId);
    await this.assertClientMembership(organisationId, userId);

    const customer = await this.billingRepo.findCustomer(organisationId, userId);
    if (!customer) {
      // No checkout has ever been attempted for this user — there's nothing to
      // manage in the portal. 400 is a better signal than 404 ("we don't know
      // about this client") since the user *does* exist.
      throw new BadRequestException(
        'Client has no Stripe customer yet. Run a checkout-session first.',
      );
    }

    const session = await this.stripeService.createBillingPortalSession(
      account.stripe_account_id,
      { customerId: customer.stripe_customer_id, returnUrl: body.returnUrl },
    );
    return { data: { url: session.url } };
  }

  async getClientSubscription(
    organisationId: string,
    userId: string,
  ): Promise<PublicClientSubscriptionResponse> {
    await this.assertClientMembership(organisationId, userId);
    const sub = await this.billingRepo.findSubscriptionForUser(organisationId, userId);
    if (!sub) return { data: null };
    return {
      data: {
        stripeSubscriptionId: sub.stripe_subscription_id,
        stripePriceId: sub.stripe_price_id,
        status: sub.status,
        currentPeriodStart: sub.current_period_start
          ? new Date(sub.current_period_start as unknown as string | number | Date).toISOString()
          : null,
        currentPeriodEnd: sub.current_period_end
          ? new Date(sub.current_period_end as unknown as string | number | Date).toISOString()
          : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        trialEnd: sub.trial_end
          ? new Date(sub.trial_end as unknown as string | number | Date).toISOString()
          : null,
      },
    };
  }

  // ---------- helpers ----------

  private async requireConnectedAccount(organisationId: string) {
    const account = await this.billingRepo.findAccountByOrg(organisationId);
    if (!account) {
      throw new BadRequestException(
        'Organisation has not completed Stripe onboarding. Direct the org admin to /v1/organisations/:id/billing/onboarding.',
      );
    }
    if (!account.charges_enabled) {
      throw new BadRequestException(
        'Organisation Stripe account is not yet enabled for charges. Complete onboarding first.',
      );
    }
    return account;
  }

  private async assertClientMembership(organisationId: string, userId: string): Promise<void> {
    const membership = await this.membershipRepo.findByUserAndOrg(userId, organisationId);
    if (!membership || membership.role !== OrganisationRole.ATHLETE) {
      throw new NotFoundException('Client not found in this organisation');
    }
  }

  /**
   * Per-(org, user) Stripe Customer. We create one lazily on first checkout so
   * clients we never bill never get a Customer record on the connected account.
   */
  private async getOrCreateCustomer(
    organisationId: string,
    stripeAccountId: string,
    userId: string,
  ) {
    const existing = await this.billingRepo.findCustomer(organisationId, userId);
    if (existing) return existing;

    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const stripeCustomer = await this.stripeService.createCustomer(stripeAccountId, {
      email: user.email,
      name: user.display_name ?? undefined,
      metadata: { organisation_id: organisationId, user_id: userId },
    });
    return this.billingRepo.createCustomer({
      organisation_id: organisationId,
      user_id: userId,
      stripe_customer_id: stripeCustomer.id,
    });
  }
}
