import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { AppConfigService } from 'src/modules/config/app-config.service';
import { StripeService } from 'src/modules/stripe/stripe.service';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';

/**
 * Receives Stripe events for the platform's Connect endpoint.
 *
 * Wiring expectations:
 *   - The controller hands us the raw request body (captured by the verify hook
 *     in `api-v1.app.module.ts`) plus the `Stripe-Signature` header. We must
 *     verify the signature against `STRIPE_WEBHOOK_SECRET` *before* parsing —
 *     hence we accept the raw payload rather than a parsed object.
 *   - Idempotency lives in `stripe_webhook_events`: we look up `event.id`, skip
 *     if already processed, otherwise apply the side effect and record.
 *   - We only mirror fields that already exist on our local rows; everything
 *     else stays on Stripe's side as the source of truth.
 *
 * Events handled in v1:
 *   - account.updated                       — sync capability flags + currency/country
 *   - product.updated                       — name/description/active
 *   - price.updated                         — active (we never edit price mutables)
 *   - customer.subscription.created/updated/deleted — upsert local mirror
 *   - customer.created                      — log; the canonical row is created
 *                                             at checkout time
 *
 * Anything else is acknowledged with a 200 (so Stripe doesn't retry forever)
 * but otherwise ignored.
 */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly billingRepo: StripeBillingRepository,
    private readonly configService: AppConfigService,
  ) {}

  /**
   * Entry point. Validates the signature, dedupes via `stripe_webhook_events`,
   * dispatches by event type.
   *
   * Returns the type so the controller can ack it in the response body — useful
   * when curl-debugging webhook delivery.
   */
  async handle(rawBody: string | Buffer | undefined, signature: string | undefined): Promise<{ id: string; type: string; deduped: boolean }> {
    if (!rawBody) {
      throw new BadRequestException('Missing raw request body. Check that the body-parser raw-body hook is wired up.');
    }
    if (!signature) {
      throw new BadRequestException('Missing Stripe-Signature header.');
    }
    const secret = this.configService.stripeWebhookSecret;
    if (!secret) {
      // Better to 503 here than silently accept unverified webhooks.
      throw new ServiceUnavailableException(
        'STRIPE_WEBHOOK_SECRET is not configured on this deployment.',
      );
    }

    // constructEvent throws if the signature is bad / payload tampered with.
    let event: Awaited<ReturnType<StripeService['constructEvent']>>;
    try {
      event = this.stripeService.constructEvent(rawBody, signature, secret);
    } catch (err) {
      this.logger.warn(`Stripe webhook signature verification failed: ${(err as Error).message}`);
      throw new BadRequestException('Invalid Stripe signature');
    }

    if (await this.billingRepo.hasProcessedWebhook(event.id)) {
      // Stripe retries aggressively; treating a redelivery as success keeps the
      // event queue moving without us double-applying side effects.
      return { id: event.id, type: event.type, deduped: true };
    }

    try {
      switch (event.type) {
        case 'account.updated':
          await this.onAccountUpdated(event.data.object as unknown as Record<string, unknown>);
          break;
        case 'product.updated':
          await this.onProductUpdated(event.data.object as unknown as Record<string, unknown>);
          break;
        case 'price.updated':
          await this.onPriceUpdated(event.data.object as unknown as Record<string, unknown>);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await this.onSubscriptionChanged(
            event.data.object as unknown as Record<string, unknown>,
            (event as unknown as { account?: string }).account,
          );
          break;
        default:
          this.logger.debug(`Ignoring unhandled Stripe event type=${event.type}`);
      }
    } catch (err) {
      // Log but rethrow so Stripe retries. We only record the dedupe row on
      // *successful* handling — partial application followed by a retry then
      // converges, which is what we want.
      this.logger.error(`Failed to handle Stripe event ${event.id} (${event.type}): ${(err as Error).message}`);
      throw err;
    }

    await this.billingRepo.recordWebhook({
      id: event.id,
      type: event.type,
      account_id: (event as unknown as { account?: string }).account ?? null,
    });
    return { id: event.id, type: event.type, deduped: false };
  }

  // ---------- handlers ----------

  private async onAccountUpdated(account: Record<string, unknown>): Promise<void> {
    const stripeAccountId = String(account.id);
    const local = await this.billingRepo.findAccountByStripeId(stripeAccountId);
    if (!local) {
      // Orphan — Stripe knows about an account we don't. Most likely a stale
      // dev environment; skip rather than auto-provision a row.
      this.logger.warn(`account.updated for unknown account ${stripeAccountId}`);
      return;
    }
    await this.billingRepo.updateAccount(local.organisation_id, {
      charges_enabled: !!account.charges_enabled,
      payouts_enabled: !!account.payouts_enabled,
      details_submitted: !!account.details_submitted,
      default_currency: (account.default_currency as string | null) ?? null,
      country: (account.country as string | null) ?? null,
    });
  }

  private async onProductUpdated(product: Record<string, unknown>): Promise<void> {
    const stripeProductId = String(product.id);
    const local = await this.billingRepo.findProductByStripeId(stripeProductId);
    if (!local) {
      this.logger.debug(`product.updated for unknown product ${stripeProductId}`);
      return;
    }
    await this.billingRepo.updateProductByStripeId(stripeProductId, {
      name: (product.name as string) ?? local.name,
      description: (product.description as string | null) ?? null,
      active: !!product.active,
    });
  }

  private async onPriceUpdated(price: Record<string, unknown>): Promise<void> {
    const stripePriceId = String(price.id);
    const local = await this.billingRepo.findPriceByStripeId(stripePriceId);
    if (!local) {
      this.logger.debug(`price.updated for unknown price ${stripePriceId}`);
      return;
    }
    await this.billingRepo.updatePriceByStripeId(stripePriceId, {
      active: !!price.active,
    });
  }

  /**
   * Subscription lifecycle handler.
   *
   * Stripe's `customer.subscription.*` events ship the full subscription object,
   * so created/updated/deleted all funnel into the same upsert — the `status`
   * field reflects the new state (`canceled`, `incomplete`, `active`, etc.).
   * We pull the per-(org,user) link off the local customer mirror; if it's
   * missing the subscription is orphan and we skip.
   */
  private async onSubscriptionChanged(
    sub: Record<string, unknown>,
    accountId: string | undefined,
  ): Promise<void> {
    const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : String((sub.customer as { id: string } | null)?.id ?? '');
    if (!stripeCustomerId) {
      this.logger.warn(`subscription event ${sub.id as string} had no customer`);
      return;
    }
    const customerRow = await this.billingRepo.findCustomerByStripeIdGlobal(stripeCustomerId);
    if (!customerRow) {
      this.logger.warn(`subscription event for unknown customer ${stripeCustomerId} (account=${accountId ?? 'platform'})`);
      return;
    }

    const items = (sub.items as { data?: { price?: { id?: string } }[] } | undefined)?.data ?? [];
    const stripePriceId = items[0]?.price?.id;
    if (!stripePriceId) {
      this.logger.warn(`subscription ${sub.id as string} had no price`);
      return;
    }

    await this.billingRepo.upsertSubscription({
      organisation_id: customerRow.organisation_id,
      user_id: customerRow.user_id,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: String(sub.id),
      stripe_price_id: stripePriceId,
      status: String(sub.status),
      current_period_start: epochToTs(sub.current_period_start),
      current_period_end: epochToTs(sub.current_period_end),
      cancel_at_period_end: !!sub.cancel_at_period_end,
      trial_end: epochToTs(sub.trial_end),
      metadata: ((sub.metadata as Record<string, string> | null) ?? {}),
    });
  }
}

/** Stripe ships timestamps as unix seconds; Kysely's Timestamp wants a Date. */
function epochToTs(value: unknown): never | null {
  if (value == null) return null;
  if (typeof value !== 'number') return null;
  return new Date(value * 1000) as unknown as never;
}
