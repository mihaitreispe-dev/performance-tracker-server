import { Kysely, sql } from 'kysely';

/**
 * Phase 9 — Stripe Connect Express + subscriptions.
 *
 * Six tables, all mirrors of Stripe state we read often or need to join against
 * our own rows (organisation, user). Authoritative state still lives in Stripe;
 * we keep enough locally to render dashboards and gate access without a Stripe
 * round-trip on every request.
 *
 *   organisation_stripe_accounts — one row per org, holds the connected-acct id
 *     (acct_xxx), capability flags refreshed from `account.updated` webhooks,
 *     and the per-org platform fee (basis points, default 500 = 5%).
 *
 *   stripe_customers — one row per (org, user). On the platform side an org's
 *     customers live inside their connected account, so the customer id is only
 *     meaningful in conjunction with the acct id.
 *
 *   stripe_products + stripe_prices — catalogue mirror. The org's admin UI lists
 *     these without a Stripe round-trip; webhook keeps them in sync if anything
 *     is edited in the Stripe dashboard directly.
 *
 *   stripe_subscriptions — sub lifecycle mirror. status / current_period_end /
 *     cancel_at_period_end are read often to gate features; everything else can
 *     be fetched from Stripe on demand.
 *
 *   stripe_coupons — coupon + promotion-code mirror so the admin UI can render
 *     active promotions without a Stripe round-trip.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('organisation_stripe_accounts')
    .addColumn('organisation_id', 'uuid', (col) =>
      col.primaryKey().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('stripe_account_id', 'varchar(80)', (col) => col.notNull().unique())
    .addColumn('charges_enabled', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('payouts_enabled', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('details_submitted', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('default_currency', 'varchar(8)')
    .addColumn('country', 'varchar(8)')
    /**
     * Platform fee in basis points (10000 = 100%). Default 500 = 5%, configurable
     * per-org via admin UI. Applied as `application_fee_percent` on every
     * subscription checkout session we create on the connected account.
     */
    .addColumn('platform_fee_bps', 'integer', (col) => col.notNull().defaultTo(500))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('stripe_customers')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('stripe_customer_id', 'varchar(80)', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('stripe_customers_org_user_uq', ['organisation_id', 'user_id'])
    .addUniqueConstraint('stripe_customers_org_stripe_uq', ['organisation_id', 'stripe_customer_id'])
    .execute();

  await db.schema
    .createTable('stripe_products')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('stripe_product_id', 'varchar(80)', (col) => col.notNull())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('stripe_products_org_stripe_uq', ['organisation_id', 'stripe_product_id'])
    .execute();

  await db.schema
    .createTable('stripe_prices')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('stripe_product_id', 'varchar(80)', (col) => col.notNull())
    .addColumn('stripe_price_id', 'varchar(80)', (col) => col.notNull())
    .addColumn('nickname', 'varchar(255)')
    .addColumn('currency', 'varchar(8)', (col) => col.notNull())
    .addColumn('unit_amount', 'integer', (col) => col.notNull()) // cents
    .addColumn('interval', 'varchar(16)', (col) => col.notNull()) // 'month' | 'year'
    .addColumn('interval_count', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('trial_period_days', 'integer')
    .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('stripe_prices_org_stripe_uq', ['organisation_id', 'stripe_price_id'])
    .execute();

  await db.schema
    .createTable('stripe_subscriptions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('stripe_customer_id', 'varchar(80)', (col) => col.notNull())
    .addColumn('stripe_subscription_id', 'varchar(80)', (col) => col.notNull().unique())
    .addColumn('stripe_price_id', 'varchar(80)', (col) => col.notNull())
    .addColumn('status', 'varchar(32)', (col) => col.notNull())
    .addColumn('current_period_start', 'timestamptz')
    .addColumn('current_period_end', 'timestamptz')
    .addColumn('cancel_at_period_end', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('trial_end', 'timestamptz')
    .addColumn('metadata', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('stripe_subscriptions_org_user_idx')
    .on('stripe_subscriptions')
    .columns(['organisation_id', 'user_id'])
    .execute();

  await db.schema
    .createTable('stripe_coupons')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('stripe_coupon_id', 'varchar(80)', (col) => col.notNull())
    .addColumn('stripe_promotion_code_id', 'varchar(80)')
    .addColumn('code', 'varchar(80)')
    .addColumn('percent_off', 'integer')
    .addColumn('amount_off', 'integer')
    .addColumn('currency', 'varchar(8)')
    .addColumn('duration', 'varchar(16)', (col) => col.notNull()) // 'once' | 'repeating' | 'forever'
    .addColumn('duration_in_months', 'integer')
    .addColumn('max_redemptions', 'integer')
    .addColumn('redeem_by', 'timestamptz')
    .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('stripe_coupons_org_stripe_uq', ['organisation_id', 'stripe_coupon_id'])
    .execute();

  /**
   * Webhook idempotency log. Stripe redelivers; we record event ids we've already
   * processed and skip duplicates. TTL'd by a separate cron after ~30 days.
   */
  await db.schema
    .createTable('stripe_webhook_events')
    .addColumn('id', 'varchar(80)', (col) => col.primaryKey()) // Stripe event id (evt_xxx)
    .addColumn('type', 'varchar(80)', (col) => col.notNull())
    .addColumn('account_id', 'varchar(80)')
    .addColumn('processed_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('stripe_webhook_events').execute();
  await db.schema.dropTable('stripe_coupons').execute();
  await db.schema.dropTable('stripe_subscriptions').execute();
  await db.schema.dropTable('stripe_prices').execute();
  await db.schema.dropTable('stripe_products').execute();
  await db.schema.dropTable('stripe_customers').execute();
  await db.schema.dropTable('organisation_stripe_accounts').execute();
}
