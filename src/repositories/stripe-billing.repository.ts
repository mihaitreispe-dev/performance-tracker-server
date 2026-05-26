import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';

import {
  Database,
  NewOrganisationStripeAccount,
  NewStripeCoupon,
  NewStripeCustomer,
  NewStripePrice,
  NewStripeProduct,
  NewStripeSubscription,
  NewStripeWebhookEvent,
  OrganisationStripeAccount,
  OrganisationStripeAccountUpdate,
  StripeCoupon,
  StripeCustomer,
  StripePrice,
  StripePriceUpdate,
  StripeProduct,
  StripeProductUpdate,
  StripeSubscription,
  StripeSubscriptionUpdate,
  StripeWebhookEvent,
} from 'src/database/interfaces';

/**
 * Aggregate repository for the Stripe mirror tables. Single class so the billing
 * service can hold one dependency instead of seven; each method maps 1:1 to a
 * table operation we actually need.
 */
@Injectable()
export class StripeBillingRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  // ---------- organisation_stripe_accounts ----------

  async findAccountByOrg(organisationId: string): Promise<OrganisationStripeAccount | undefined> {
    return this.db
      .selectFrom('organisation_stripe_accounts')
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .executeTakeFirst();
  }

  async findAccountByStripeId(stripeAccountId: string): Promise<OrganisationStripeAccount | undefined> {
    return this.db
      .selectFrom('organisation_stripe_accounts')
      .where('stripe_account_id', '=', stripeAccountId)
      .selectAll()
      .executeTakeFirst();
  }

  async createAccount(row: NewOrganisationStripeAccount): Promise<OrganisationStripeAccount> {
    return this.db
      .insertInto('organisation_stripe_accounts')
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateAccount(
    organisationId: string,
    patch: OrganisationStripeAccountUpdate,
  ): Promise<OrganisationStripeAccount> {
    return this.db
      .updateTable('organisation_stripe_accounts')
      .set({ ...patch, updated_at: sql`now()` })
      .where('organisation_id', '=', organisationId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ---------- stripe_customers ----------

  async findCustomer(organisationId: string, userId: string): Promise<StripeCustomer | undefined> {
    return this.db
      .selectFrom('stripe_customers')
      .where('organisation_id', '=', organisationId)
      .where('user_id', '=', userId)
      .selectAll()
      .executeTakeFirst();
  }

  async findCustomerByStripeId(
    organisationId: string,
    stripeCustomerId: string,
  ): Promise<StripeCustomer | undefined> {
    return this.db
      .selectFrom('stripe_customers')
      .where('organisation_id', '=', organisationId)
      .where('stripe_customer_id', '=', stripeCustomerId)
      .selectAll()
      .executeTakeFirst();
  }

  /**
   * Webhook-only lookup. Stripe customer ids are per-Connect-account, so the
   * (org, stripe_customer_id) tuple uniquely identifies a row even though
   * `stripe_customer_id` alone could collide across orgs in principle. In
   * practice we use this from event handlers where the row must already exist.
   */
  async findCustomerByStripeIdGlobal(
    stripeCustomerId: string,
  ): Promise<StripeCustomer | undefined> {
    return this.db
      .selectFrom('stripe_customers')
      .where('stripe_customer_id', '=', stripeCustomerId)
      .selectAll()
      .executeTakeFirst();
  }

  async createCustomer(row: NewStripeCustomer): Promise<StripeCustomer> {
    return this.db
      .insertInto('stripe_customers')
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ---------- stripe_products ----------

  async listProducts(organisationId: string, opts: { activeOnly?: boolean } = {}): Promise<StripeProduct[]> {
    let q = this.db.selectFrom('stripe_products').where('organisation_id', '=', organisationId);
    if (opts.activeOnly) q = q.where('active', '=', true);
    return q.selectAll().orderBy('created_at', 'desc').execute();
  }

  async findProduct(organisationId: string, id: string): Promise<StripeProduct | undefined> {
    return this.db
      .selectFrom('stripe_products')
      .where('organisation_id', '=', organisationId)
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();
  }

  async findProductByStripeId(stripeProductId: string): Promise<StripeProduct | undefined> {
    return this.db
      .selectFrom('stripe_products')
      .where('stripe_product_id', '=', stripeProductId)
      .selectAll()
      .executeTakeFirst();
  }

  /**
   * Find a product by its local primary key alone — no org scoping.
   * Callers are responsible for verifying tenant ownership when they
   * use this (the entitlements service does, see
   * `setEntitlementsForResource`). Used over `findProduct` when the
   * caller has the local id but doesn't already have the org id in
   * hand and wants to avoid an extra query just to check it.
   */
  async findProductById(id: string): Promise<StripeProduct | undefined> {
    return this.db
      .selectFrom('stripe_products')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();
  }

  async createProduct(row: NewStripeProduct): Promise<StripeProduct> {
    return this.db
      .insertInto('stripe_products')
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateProductByStripeId(
    stripeProductId: string,
    patch: StripeProductUpdate,
  ): Promise<StripeProduct | undefined> {
    return this.db
      .updateTable('stripe_products')
      .set({ ...patch, updated_at: sql`now()` })
      .where('stripe_product_id', '=', stripeProductId)
      .returningAll()
      .executeTakeFirst();
  }

  // ---------- stripe_prices ----------

  async listPrices(
    organisationId: string,
    opts: { productId?: string; activeOnly?: boolean } = {},
  ): Promise<StripePrice[]> {
    let q = this.db.selectFrom('stripe_prices').where('organisation_id', '=', organisationId);
    if (opts.productId) q = q.where('stripe_product_id', '=', opts.productId);
    if (opts.activeOnly) q = q.where('active', '=', true);
    return q.selectAll().orderBy('created_at', 'asc').execute();
  }

  async findPrice(organisationId: string, id: string): Promise<StripePrice | undefined> {
    return this.db
      .selectFrom('stripe_prices')
      .where('organisation_id', '=', organisationId)
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();
  }

  async findPriceByStripeId(stripePriceId: string): Promise<StripePrice | undefined> {
    return this.db
      .selectFrom('stripe_prices')
      .where('stripe_price_id', '=', stripePriceId)
      .selectAll()
      .executeTakeFirst();
  }

  async createPrice(row: NewStripePrice): Promise<StripePrice> {
    return this.db
      .insertInto('stripe_prices')
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updatePriceByStripeId(
    stripePriceId: string,
    patch: StripePriceUpdate,
  ): Promise<StripePrice | undefined> {
    return this.db
      .updateTable('stripe_prices')
      .set({ ...patch, updated_at: sql`now()` })
      .where('stripe_price_id', '=', stripePriceId)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Batch lookup of every active price across many Stripe product ids.
   * Used by the entitlements service to pick a "cheapest price" hint for
   * the paywall UI without a per-product roundtrip. Returns rows; the
   * caller is responsible for the min-per-product reduction.
   */
  async listActivePricesForProducts(stripeProductIds: string[]): Promise<StripePrice[]> {
    if (stripeProductIds.length === 0) return [];
    return this.db
      .selectFrom('stripe_prices')
      .where('stripe_product_id', 'in', stripeProductIds)
      .where('active', '=', true)
      .selectAll()
      .execute();
  }

  // ---------- stripe_subscriptions ----------

  async listSubscriptionsForOrg(organisationId: string, opts: { offset?: number; limit?: number } = {}): Promise<StripeSubscription[]> {
    return this.db
      .selectFrom('stripe_subscriptions')
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .orderBy('created_at', 'desc')
      .offset(opts.offset ?? 0)
      .limit(opts.limit ?? 50)
      .execute();
  }

  async findSubscriptionForUser(
    organisationId: string,
    userId: string,
  ): Promise<StripeSubscription | undefined> {
    return this.db
      .selectFrom('stripe_subscriptions')
      .where('organisation_id', '=', organisationId)
      .where('user_id', '=', userId)
      .where('status', 'in', ['trialing', 'active', 'past_due', 'unpaid'])
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  /**
   * Resolve every local stripe_products.id that the user currently has
   * an active or trialing subscription to. Powers batch lock-status
   * checks (list endpoints). Pre-flattened to a primitive[] so callers
   * can stuff it into a Set without an extra map.
   *
   * Active = (trialing, active). Excludes past_due / unpaid / canceled —
   * see `userHasAccess` in the entitlements repo for the matching
   * single-resource version of this rule.
   */
  async listActiveProductIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('stripe_subscriptions as s')
      .innerJoin('stripe_prices as pr', 'pr.stripe_price_id', 's.stripe_price_id')
      .innerJoin('stripe_products as p', 'p.stripe_product_id', 'pr.stripe_product_id')
      .where('s.user_id', '=', userId)
      .where('s.status', 'in', ['trialing', 'active'])
      .select('p.id')
      .distinct()
      .execute();
    return rows.map((r) => r.id);
  }

  async findSubscriptionByStripeId(
    stripeSubscriptionId: string,
  ): Promise<StripeSubscription | undefined> {
    return this.db
      .selectFrom('stripe_subscriptions')
      .where('stripe_subscription_id', '=', stripeSubscriptionId)
      .selectAll()
      .executeTakeFirst();
  }

  async upsertSubscription(row: NewStripeSubscription): Promise<StripeSubscription> {
    const existing = await this.findSubscriptionByStripeId(row.stripe_subscription_id);
    if (existing) {
      const patch: StripeSubscriptionUpdate = {
        status: row.status,
        stripe_price_id: row.stripe_price_id,
        current_period_start: row.current_period_start ?? null,
        current_period_end: row.current_period_end ?? null,
        cancel_at_period_end: row.cancel_at_period_end ?? false,
        trial_end: row.trial_end ?? null,
        metadata: row.metadata ?? {},
        user_id: row.user_id ?? null,
      };
      return this.db
        .updateTable('stripe_subscriptions')
        .set({ ...patch, updated_at: sql`now()` })
        .where('id', '=', existing.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    return this.db
      .insertInto('stripe_subscriptions')
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ---------- stripe_coupons ----------

  async listCoupons(organisationId: string, opts: { activeOnly?: boolean } = {}): Promise<StripeCoupon[]> {
    let q = this.db.selectFrom('stripe_coupons').where('organisation_id', '=', organisationId);
    if (opts.activeOnly) q = q.where('active', '=', true);
    return q.selectAll().orderBy('created_at', 'desc').execute();
  }

  async findCoupon(organisationId: string, id: string): Promise<StripeCoupon | undefined> {
    return this.db
      .selectFrom('stripe_coupons')
      .where('organisation_id', '=', organisationId)
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();
  }

  async createCoupon(row: NewStripeCoupon): Promise<StripeCoupon> {
    return this.db
      .insertInto('stripe_coupons')
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deactivateCoupon(organisationId: string, id: string): Promise<StripeCoupon> {
    return this.db
      .updateTable('stripe_coupons')
      .set({ active: false, updated_at: sql`now()` })
      .where('organisation_id', '=', organisationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ---------- stripe_webhook_events (idempotency log) ----------

  async hasProcessedWebhook(eventId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('stripe_webhook_events')
      .where('id', '=', eventId)
      .select('id')
      .executeTakeFirst();
    return !!row;
  }

  async recordWebhook(row: NewStripeWebhookEvent): Promise<StripeWebhookEvent> {
    return this.db
      .insertInto('stripe_webhook_events')
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
