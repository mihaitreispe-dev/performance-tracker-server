import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppConfigService } from 'src/modules/config/app-config.service';
import { StripeService } from 'src/modules/stripe/stripe.service';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';

import { StripeWebhookService } from './stripe-webhook.service';

/**
 * Coverage on the surface that matters for production:
 *   - signature verification preconditions (missing body / sig / secret)
 *   - idempotency via `stripe_webhook_events`
 *   - per-event dispatch updates the right local mirror
 *
 * `constructEvent` is mocked, so we never actually verify a real signature in
 * the unit suite. Real HMAC behaviour is covered by the Stripe SDK itself.
 */
describe('StripeWebhookService', () => {
  let service: StripeWebhookService;
  let stripeService: jest.Mocked<StripeService>;
  let billingRepo: jest.Mocked<StripeBillingRepository>;
  let configService: { stripeWebhookSecret?: string };

  beforeEach(async () => {
    configService = { stripeWebhookSecret: 'whsec_test' };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeWebhookService,
        {
          provide: StripeService,
          useValue: { constructEvent: jest.fn() },
        },
        {
          provide: StripeBillingRepository,
          useValue: {
            hasProcessedWebhook: jest.fn(),
            recordWebhook: jest.fn(),
            findAccountByStripeId: jest.fn(),
            updateAccount: jest.fn(),
            findProductByStripeId: jest.fn(),
            updateProductByStripeId: jest.fn(),
            findPriceByStripeId: jest.fn(),
            updatePriceByStripeId: jest.fn(),
            findCustomerByStripeIdGlobal: jest.fn(),
            upsertSubscription: jest.fn(),
          },
        },
        { provide: AppConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(StripeWebhookService);
    stripeService = module.get(StripeService);
    billingRepo = module.get(StripeBillingRepository);
  });

  it('rejects requests without a raw body', async () => {
    await expect(service.handle(undefined, 'sig')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects requests without a Stripe-Signature header', async () => {
    await expect(service.handle('{}', undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('503s when STRIPE_WEBHOOK_SECRET is unset', async () => {
    configService.stripeWebhookSecret = undefined;
    await expect(service.handle('{}', 'sig')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('400s on bad signatures', async () => {
    stripeService.constructEvent.mockImplementation(() => {
      throw new Error('No signatures match');
    });
    await expect(service.handle('{}', 'sig')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dedupes redelivered events without applying side effects', async () => {
    stripeService.constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'product.updated',
      data: { object: { id: 'prod_1' } },
    } as never);
    billingRepo.hasProcessedWebhook.mockResolvedValue(true);

    const res = await service.handle('{}', 'sig');

    expect(res).toEqual({ id: 'evt_1', type: 'product.updated', deduped: true });
    expect(billingRepo.updateProductByStripeId).not.toHaveBeenCalled();
    expect(billingRepo.recordWebhook).not.toHaveBeenCalled();
  });

  it('account.updated syncs capability flags + currency/country', async () => {
    stripeService.constructEvent.mockReturnValue({
      id: 'evt_2',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_1',
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
          default_currency: 'usd',
          country: 'US',
        },
      },
    } as never);
    billingRepo.hasProcessedWebhook.mockResolvedValue(false);
    billingRepo.findAccountByStripeId.mockResolvedValue({
      organisation_id: 'org-1',
      stripe_account_id: 'acct_1',
    } as never);

    await service.handle('{}', 'sig');

    expect(billingRepo.updateAccount).toHaveBeenCalledWith('org-1', {
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      default_currency: 'usd',
      country: 'US',
    });
    expect(billingRepo.recordWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt_2', type: 'account.updated' }),
    );
  });

  it('account.updated for an unknown account is a soft no-op', async () => {
    stripeService.constructEvent.mockReturnValue({
      id: 'evt_3',
      type: 'account.updated',
      data: { object: { id: 'acct_unknown' } },
    } as never);
    billingRepo.hasProcessedWebhook.mockResolvedValue(false);
    billingRepo.findAccountByStripeId.mockResolvedValue(undefined);

    const res = await service.handle('{}', 'sig');
    expect(billingRepo.updateAccount).not.toHaveBeenCalled();
    // We *do* record the event so we don't keep dispatching it on retry.
    expect(billingRepo.recordWebhook).toHaveBeenCalled();
    expect(res.deduped).toBe(false);
  });

  it('customer.subscription.updated upserts the local mirror', async () => {
    stripeService.constructEvent.mockReturnValue({
      id: 'evt_4',
      type: 'customer.subscription.updated',
      account: 'acct_1',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          current_period_start: 1700000000,
          current_period_end: 1702000000,
          cancel_at_period_end: false,
          trial_end: null,
          items: { data: [{ price: { id: 'price_1' } }] },
          metadata: { plan: 'pro' },
        },
      },
    } as never);
    billingRepo.hasProcessedWebhook.mockResolvedValue(false);
    billingRepo.findCustomerByStripeIdGlobal.mockResolvedValue({
      organisation_id: 'org-1',
      user_id: 'user-1',
      stripe_customer_id: 'cus_1',
    } as never);

    await service.handle('{}', 'sig');

    expect(billingRepo.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        organisation_id: 'org-1',
        user_id: 'user-1',
        stripe_subscription_id: 'sub_1',
        stripe_price_id: 'price_1',
        status: 'active',
      }),
    );
  });

  it('unknown subscription customer is skipped (no upsert, but recorded)', async () => {
    stripeService.constructEvent.mockReturnValue({
      id: 'evt_5',
      type: 'customer.subscription.created',
      account: 'acct_1',
      data: {
        object: {
          id: 'sub_2',
          customer: 'cus_orphan',
          status: 'incomplete',
          items: { data: [{ price: { id: 'price_1' } }] },
        },
      },
    } as never);
    billingRepo.hasProcessedWebhook.mockResolvedValue(false);
    billingRepo.findCustomerByStripeIdGlobal.mockResolvedValue(undefined);

    await service.handle('{}', 'sig');

    expect(billingRepo.upsertSubscription).not.toHaveBeenCalled();
    expect(billingRepo.recordWebhook).toHaveBeenCalled();
  });

  it('ignores unhandled event types but still records them for dedupe', async () => {
    stripeService.constructEvent.mockReturnValue({
      id: 'evt_6',
      type: 'invoice.payment_succeeded',
      data: { object: { id: 'in_1' } },
    } as never);
    billingRepo.hasProcessedWebhook.mockResolvedValue(false);

    const res = await service.handle('{}', 'sig');
    expect(res.type).toBe('invoice.payment_succeeded');
    expect(billingRepo.recordWebhook).toHaveBeenCalled();
  });
});
