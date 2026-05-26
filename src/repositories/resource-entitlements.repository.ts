import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';

import {
  Database,
  EntitlementResourceType,
  NewResourceEntitlement,
  ResourceEntitlement,
  StripeProduct,
} from 'src/database/interfaces';

/**
 * "Tier required" join — every read path that may need to gate a
 * resource goes through this repo. Methods are tight to the access
 * patterns we actually use rather than generic CRUD because that's where
 * the join + tenant-scope rules live.
 */
@Injectable()
export class ResourceEntitlementsRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  /**
   * All entitlement rows for a single resource, joined with the linked
   * Stripe product so callers can surface tier names/descriptions in one
   * shot. Empty array = resource is free.
   */
  async listForResource(
    resourceType: EntitlementResourceType,
    resourceId: string,
  ): Promise<Array<ResourceEntitlement & { product: StripeProduct }>> {
    const rows = await this.db
      .selectFrom('resource_entitlements as re')
      .innerJoin('stripe_products as p', 'p.id', 're.stripe_product_id')
      .where('re.resource_type', '=', resourceType)
      .where('re.resource_id', '=', resourceId)
      .select([
        're.id as id',
        're.organisation_id as organisation_id',
        're.resource_type as resource_type',
        're.resource_id as resource_id',
        're.stripe_product_id as stripe_product_id',
        're.created_at as created_at',
        're.updated_at as updated_at',
        'p.id as p_id',
        'p.organisation_id as p_organisation_id',
        'p.stripe_product_id as p_stripe_product_id',
        'p.name as p_name',
        'p.description as p_description',
        'p.active as p_active',
        'p.created_at as p_created_at',
        'p.updated_at as p_updated_at',
      ])
      .execute();

    return rows.map((r) => ({
      id: r.id,
      organisation_id: r.organisation_id,
      resource_type: r.resource_type as EntitlementResourceType,
      resource_id: r.resource_id,
      stripe_product_id: r.stripe_product_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
      product: {
        id: r.p_id,
        organisation_id: r.p_organisation_id,
        stripe_product_id: r.p_stripe_product_id,
        name: r.p_name,
        description: r.p_description,
        active: r.p_active,
        created_at: r.p_created_at,
        updated_at: r.p_updated_at,
      },
    }));
  }

  /**
   * Batch variant — fetches entitlement rows for many resources at once.
   * Used by list endpoints so we can stamp each row with its lock state
   * in a single query rather than N follow-ups. Returns a Map keyed by
   * `resource_id` for cheap consumer-side joins.
   */
  async listForResources(
    resourceType: EntitlementResourceType,
    resourceIds: string[],
  ): Promise<Map<string, Array<ResourceEntitlement & { product: StripeProduct }>>> {
    if (resourceIds.length === 0) return new Map();

    const rows = await this.db
      .selectFrom('resource_entitlements as re')
      .innerJoin('stripe_products as p', 'p.id', 're.stripe_product_id')
      .where('re.resource_type', '=', resourceType)
      .where('re.resource_id', 'in', resourceIds)
      .select([
        're.id as id',
        're.organisation_id as organisation_id',
        're.resource_type as resource_type',
        're.resource_id as resource_id',
        're.stripe_product_id as stripe_product_id',
        're.created_at as created_at',
        're.updated_at as updated_at',
        'p.id as p_id',
        'p.organisation_id as p_organisation_id',
        'p.stripe_product_id as p_stripe_product_id',
        'p.name as p_name',
        'p.description as p_description',
        'p.active as p_active',
        'p.created_at as p_created_at',
        'p.updated_at as p_updated_at',
      ])
      .execute();

    const byResource = new Map<string, Array<ResourceEntitlement & { product: StripeProduct }>>();
    for (const r of rows) {
      const entry: ResourceEntitlement & { product: StripeProduct } = {
        id: r.id,
        organisation_id: r.organisation_id,
        resource_type: r.resource_type as EntitlementResourceType,
        resource_id: r.resource_id,
        stripe_product_id: r.stripe_product_id,
        created_at: r.created_at,
        updated_at: r.updated_at,
        product: {
          id: r.p_id,
          organisation_id: r.p_organisation_id,
          stripe_product_id: r.p_stripe_product_id,
          name: r.p_name,
          description: r.p_description,
          active: r.p_active,
          created_at: r.p_created_at,
          updated_at: r.p_updated_at,
        },
      };
      const existing = byResource.get(r.resource_id);
      if (existing) existing.push(entry);
      else byResource.set(r.resource_id, [entry]);
    }
    return byResource;
  }

  /**
   * Replace the entitlement set for a resource atomically. The admin UI
   * always sends the desired final set, not deltas — keeps the API
   * idempotent and side-steps the "did I forget to send a remove?" class
   * of bugs. Returns the new set.
   *
   * Caller is responsible for verifying the product ids belong to the
   * same org as the resource; this repo is unguarded by design (it's
   * also used by the webhook path that does its own check).
   */
  async replaceForResource(
    organisationId: string,
    resourceType: EntitlementResourceType,
    resourceId: string,
    stripeProductIds: string[],
  ): Promise<ResourceEntitlement[]> {
    return this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('resource_entitlements')
        .where('resource_type', '=', resourceType)
        .where('resource_id', '=', resourceId)
        .execute();

      if (stripeProductIds.length === 0) return [];

      const rows: NewResourceEntitlement[] = stripeProductIds.map((productId) => ({
        organisation_id: organisationId,
        resource_type: resourceType,
        resource_id: resourceId,
        stripe_product_id: productId,
      }));
      return trx.insertInto('resource_entitlements').values(rows).returningAll().execute();
    });
  }

  /**
   * The hot-path entitlement check: does this user hold an active
   * subscription that maps to *any* of the products required by the
   * resource?
   *
   * Active = status in ('trialing', 'active'). We deliberately exclude
   * past_due / unpaid / canceled — clients in arrears shouldn't keep
   * access. (The list of "still considered active" statuses is narrower
   * than findSubscriptionForUser uses for the admin/list view, where
   * showing past_due rows is useful.)
   *
   * Returns `true` if the resource has no entitlement rows (i.e. it's
   * free) or if the user has at least one matching active subscription.
   */
  async userHasAccess(
    userId: string,
    resourceType: EntitlementResourceType,
    resourceId: string,
  ): Promise<boolean> {
    const required = await this.db
      .selectFrom('resource_entitlements')
      .where('resource_type', '=', resourceType)
      .where('resource_id', '=', resourceId)
      .select('stripe_product_id')
      .execute();

    if (required.length === 0) return true; // not gated → free

    const requiredProductIds = required.map((r) => r.stripe_product_id);

    // Resolve user's active subscriptions → their price → that price's
    // product. Match against the required list. One DB round-trip via
    // joins; the indices on stripe_subscriptions.user_id +
    // stripe_prices.stripe_price_id keep it tight.
    const hit = await this.db
      .selectFrom('stripe_subscriptions as s')
      .innerJoin('stripe_prices as pr', 'pr.stripe_price_id', 's.stripe_price_id')
      .innerJoin('stripe_products as p', 'p.stripe_product_id', 'pr.stripe_product_id')
      .where('s.user_id', '=', userId)
      .where('s.status', 'in', ['trialing', 'active'])
      .where('p.id', 'in', requiredProductIds)
      .select('p.id')
      .limit(1)
      .executeTakeFirst();

    return !!hit;
  }
}
