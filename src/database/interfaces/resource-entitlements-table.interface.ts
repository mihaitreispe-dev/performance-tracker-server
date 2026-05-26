import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Kinds of resources that can be gated behind a subscription tier.
 *
 * Adding a new kind is a 3-step process:
 *   1. extend this union;
 *   2. extend the CHECK constraint in
 *      migrations/1774402000000_create_resource_entitlements.ts (via a new
 *      migration — never edit a shipped migration);
 *   3. teach EntitlementsService how to look up the resource's
 *      organisation for the cross-tenant guard.
 */
export type EntitlementResourceType = 'workout' | 'content_item' | 'course';

/**
 * Polymorphic "this resource requires a subscription to product X" join.
 * Multiple rows for the same resource mean any-of semantics — the client
 * needs an active subscription to *one* of the listed products to unlock.
 * No rows = freely accessible.
 *
 * `organisation_id` is denormalised so we can tenant-scope queries
 * cheaply (no need to join through three different resource tables) and
 * so the org-deletion cascade reaches this table directly.
 */
export interface ResourceEntitlementsTable {
  id: Generated<string>;
  organisation_id: string;
  resource_type: EntitlementResourceType;
  resource_id: string;
  /** FK to `stripe_products.id` (the local mirror row), not the bare Stripe id. */
  stripe_product_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type ResourceEntitlement = Selectable<ResourceEntitlementsTable>;
export type NewResourceEntitlement = Insertable<ResourceEntitlementsTable>;
export type ResourceEntitlementUpdate = Updateable<ResourceEntitlementsTable>;
