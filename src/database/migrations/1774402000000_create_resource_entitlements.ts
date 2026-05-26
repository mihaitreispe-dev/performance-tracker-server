import { Kysely, sql } from 'kysely';

/**
 * Resource → required-product join. Powers the subscription paywall:
 * each row says "to access `(resource_type, resource_id)` the client must
 * have an active subscription that resolves to `stripe_product_id`."
 *
 * Design choices:
 *
 *   - **Polymorphic table over per-resource join tables.** We gate three
 *     distinct resource kinds (workouts, content_items, courses) and may
 *     add more (plans, exercises) later. A single table keeps the schema
 *     compact, lets us reuse one repository + entitlement service across
 *     all kinds, and avoids a tri-write on the create path. The tradeoff
 *     is that we can't FK-constrain `resource_id` (Postgres doesn't
 *     support polymorphic foreign keys); we handle orphan cleanup at the
 *     application layer when a resource is hard-deleted.
 *
 *   - **Any-of semantics.** Multiple rows for the same resource mean the
 *     client only needs *one* of the listed products to unlock — fits the
 *     common "Pro OR Elite both unlock the elite library" pattern. No row
 *     for a resource = freely accessible.
 *
 *   - **Cascade on stripe_product_id.** If an org archives / deletes a
 *     product, the row goes away and the resource becomes free again
 *     (matching the natural "no longer offering that tier" intent). Orgs
 *     can re-attach a different tier without orphan cleanup.
 *
 *   - **`organisation_id` denormalised** for tenant scoping in queries
 *     and a fast cascade when an org is deleted. Kept in sync via
 *     application code; not derivable cheaply otherwise across resource
 *     kinds.
 *
 *   - **Unique on (resource_type, resource_id, stripe_product_id)** so
 *     adding the same tier twice is a no-op rather than a duplicate row.
 *
 * `resource_type` is a CHECK-bounded text column rather than a Postgres
 * enum so adding new kinds doesn't require a schema migration to extend
 * the enum (which is a write-locking operation on large tables).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('resource_entitlements')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('resource_type', 'varchar(32)', (col) => col.notNull())
    .addColumn('resource_id', 'uuid', (col) => col.notNull())
    .addColumn('stripe_product_id', 'uuid', (col) =>
      col.notNull().references('stripe_products.id').onDelete('cascade'),
    )
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      'resource_entitlements_resource_type_chk',
      sql`resource_type IN ('workout', 'content_item', 'course')`,
    )
    .addUniqueConstraint('resource_entitlements_unique_triple', [
      'resource_type',
      'resource_id',
      'stripe_product_id',
    ])
    .execute();

  // Lookup by (resource_type, resource_id) is the hot path — every public
  // GET of a workout/snack/course hits it to check whether the resource
  // is gated.
  await db.schema
    .createIndex('idx_resource_entitlements_resource')
    .on('resource_entitlements')
    .columns(['resource_type', 'resource_id'])
    .execute();

  // Lookup by product — used when an org views "which resources use this
  // tier" and when a product is archived (the cascade does the work but
  // we still report the affected count back).
  await db.schema
    .createIndex('idx_resource_entitlements_product')
    .on('resource_entitlements')
    .column('stripe_product_id')
    .execute();

  // Lookup by org — tenant-scope every query for safety + powers admin
  // dashboards that list "all gated resources in this org".
  await db.schema
    .createIndex('idx_resource_entitlements_organisation')
    .on('resource_entitlements')
    .column('organisation_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('resource_entitlements').execute();
}
