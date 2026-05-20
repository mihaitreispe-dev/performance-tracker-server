import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Local mirror of the connected Stripe account per organisation. Capability flags
 * (charges_enabled, payouts_enabled, details_submitted) are kept in sync via the
 * `account.updated` webhook. `platform_fee_bps` is the platform's revenue share
 * on every subscription charge (default 500 = 5%), applied as
 * `application_fee_percent` on Checkout Sessions.
 */
export interface OrganisationStripeAccountsTable {
  organisation_id: string;
  stripe_account_id: string;
  charges_enabled: Generated<boolean>;
  payouts_enabled: Generated<boolean>;
  details_submitted: Generated<boolean>;
  default_currency: string | null;
  country: string | null;
  platform_fee_bps: Generated<number>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type OrganisationStripeAccount = Selectable<OrganisationStripeAccountsTable>;
export type NewOrganisationStripeAccount = Insertable<OrganisationStripeAccountsTable>;
export type OrganisationStripeAccountUpdate = Updateable<OrganisationStripeAccountsTable>;

export interface StripeCustomersTable {
  id: Generated<string>;
  organisation_id: string;
  user_id: string;
  stripe_customer_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type StripeCustomer = Selectable<StripeCustomersTable>;
export type NewStripeCustomer = Insertable<StripeCustomersTable>;

export interface StripeProductsTable {
  id: Generated<string>;
  organisation_id: string;
  stripe_product_id: string;
  name: string;
  description: string | null;
  active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type StripeProduct = Selectable<StripeProductsTable>;
export type NewStripeProduct = Insertable<StripeProductsTable>;
export type StripeProductUpdate = Updateable<StripeProductsTable>;

export interface StripePricesTable {
  id: Generated<string>;
  organisation_id: string;
  stripe_product_id: string;
  stripe_price_id: string;
  nickname: string | null;
  currency: string;
  /** Smallest currency unit (cents for USD). */
  unit_amount: number;
  /** 'month' | 'year'. We support recurring only in v1. */
  interval: string;
  interval_count: Generated<number>;
  trial_period_days: number | null;
  active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type StripePrice = Selectable<StripePricesTable>;
export type NewStripePrice = Insertable<StripePricesTable>;
export type StripePriceUpdate = Updateable<StripePricesTable>;

/**
 * Free-form metadata Stripe carries on the subscription. Stored verbatim from the
 * Stripe payload so admin tooling can read whatever the customer's integration set.
 */
export type StripeSubscriptionMetadata = Record<string, string>;

export interface StripeSubscriptionsTable {
  id: Generated<string>;
  organisation_id: string;
  user_id: string | null;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  status: string;
  current_period_start: Timestamp | null;
  current_period_end: Timestamp | null;
  cancel_at_period_end: Generated<boolean>;
  trial_end: Timestamp | null;
  metadata: ColumnType<
    StripeSubscriptionMetadata,
    StripeSubscriptionMetadata | undefined,
    StripeSubscriptionMetadata
  >;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type StripeSubscription = Selectable<StripeSubscriptionsTable>;
export type NewStripeSubscription = Insertable<StripeSubscriptionsTable>;
export type StripeSubscriptionUpdate = Updateable<StripeSubscriptionsTable>;

export interface StripeCouponsTable {
  id: Generated<string>;
  organisation_id: string;
  stripe_coupon_id: string;
  stripe_promotion_code_id: string | null;
  /** Customer-typeable code at checkout, if a promotion code was minted. */
  code: string | null;
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  /** 'once' | 'repeating' | 'forever'. */
  duration: string;
  duration_in_months: number | null;
  max_redemptions: number | null;
  redeem_by: Timestamp | null;
  active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type StripeCoupon = Selectable<StripeCouponsTable>;
export type NewStripeCoupon = Insertable<StripeCouponsTable>;

/**
 * Webhook idempotency log. We record every Stripe event id we've processed and
 * skip duplicates on redelivery. Purged after 30 days by a cron (not implemented
 * in v1; we just let the table grow until it matters).
 */
export interface StripeWebhookEventsTable {
  id: string;
  type: string;
  account_id: string | null;
  processed_at: Generated<Timestamp>;
}

export type StripeWebhookEvent = Selectable<StripeWebhookEventsTable>;
export type NewStripeWebhookEvent = Insertable<StripeWebhookEventsTable>;
