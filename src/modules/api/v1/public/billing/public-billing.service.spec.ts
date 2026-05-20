import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { OrganisationRole } from 'src/database/interfaces';
import { StripeService } from 'src/modules/stripe/stripe.service';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { PublicBillingService } from './public-billing.service';

/**
 * Focused on the public-API guarantees:
 *   - tenant boundary: client must be in this org with role=ATHLETE
 *   - Stripe customer is provisioned lazily on first checkout
 *   - subscription getter returns null (not throws) when there's no active sub
 *   - billing-portal call fails clearly when the client has no Stripe customer
 */
const ORG = 'org-1';
const USER = 'user-1';

describe('PublicBillingService', () => {
  let service: PublicBillingService;
  let billingRepo: jest.Mocked<StripeBillingRepository>;
  let membershipRepo: jest.Mocked<OrganisationMembershipRepository>;
  let userRepo: jest.Mocked<UserRepository>;
  let stripeService: jest.Mocked<StripeService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicBillingService,
        {
          provide: StripeBillingRepository,
          useValue: {
            listProducts: jest.fn().mockResolvedValue([]),
            listPrices: jest.fn().mockResolvedValue([]),
            findAccountByOrg: jest.fn(),
            findPriceByStripeId: jest.fn(),
            findCustomer: jest.fn(),
            createCustomer: jest.fn(),
            findSubscriptionForUser: jest.fn(),
          },
        },
        {
          provide: OrganisationMembershipRepository,
          useValue: { findByUserAndOrg: jest.fn() },
        },
        {
          provide: UserRepository,
          useValue: { findById: jest.fn() },
        },
        {
          provide: StripeService,
          useValue: {
            createCheckoutSession: jest.fn(),
            createBillingPortalSession: jest.fn(),
            createCustomer: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PublicBillingService);
    billingRepo = module.get(StripeBillingRepository);
    membershipRepo = module.get(OrganisationMembershipRepository);
    userRepo = module.get(UserRepository);
    stripeService = module.get(StripeService);
  });

  describe('listProducts', () => {
    it('groups active prices under their product', async () => {
      billingRepo.listProducts.mockResolvedValue([
        {
          stripe_product_id: 'prod_1',
          name: 'Coaching',
          description: null,
          active: true,
        } as never,
      ]);
      billingRepo.listPrices.mockResolvedValue([
        {
          stripe_product_id: 'prod_1',
          stripe_price_id: 'price_1',
          nickname: null,
          currency: 'usd',
          unit_amount: 1999,
          interval: 'month',
          interval_count: 1,
          trial_period_days: null,
          active: true,
        } as never,
      ]);

      const res = await service.listProducts(ORG, {});

      expect(res.data).toHaveLength(1);
      expect(res.data[0].prices).toHaveLength(1);
      expect(res.data[0].prices[0].stripePriceId).toBe('price_1');
      // Default to active-only.
      expect(billingRepo.listProducts).toHaveBeenCalledWith(ORG, { activeOnly: true });
    });
  });

  describe('createCheckoutSession', () => {
    it('throws when the org has not completed onboarding', async () => {
      billingRepo.findAccountByOrg.mockResolvedValue(undefined);

      await expect(
        service.createCheckoutSession(ORG, USER, {
          priceId: 'price_1',
          successUrl: 'https://app/ok',
          cancelUrl: 'https://app/no',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when charges_enabled is false', async () => {
      billingRepo.findAccountByOrg.mockResolvedValue({
        stripe_account_id: 'acct_1',
        charges_enabled: false,
        platform_fee_bps: 500,
      } as never);

      await expect(
        service.createCheckoutSession(ORG, USER, {
          priceId: 'price_1',
          successUrl: 'https://app/ok',
          cancelUrl: 'https://app/no',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects price from a different org (tenant boundary)', async () => {
      billingRepo.findAccountByOrg.mockResolvedValue({
        stripe_account_id: 'acct_1',
        charges_enabled: true,
        platform_fee_bps: 500,
      } as never);
      billingRepo.findPriceByStripeId.mockResolvedValue({
        organisation_id: 'other-org',
        active: true,
      } as never);

      await expect(
        service.createCheckoutSession(ORG, USER, {
          priceId: 'price_x',
          successUrl: 'https://app/ok',
          cancelUrl: 'https://app/no',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects non-athlete clients', async () => {
      billingRepo.findAccountByOrg.mockResolvedValue({
        stripe_account_id: 'acct_1',
        charges_enabled: true,
        platform_fee_bps: 500,
      } as never);
      billingRepo.findPriceByStripeId.mockResolvedValue({
        organisation_id: ORG,
        active: true,
        stripe_price_id: 'price_1',
      } as never);
      membershipRepo.findByUserAndOrg.mockResolvedValue({
        role: OrganisationRole.COACH,
      } as never);

      await expect(
        service.createCheckoutSession(ORG, USER, {
          priceId: 'price_1',
          successUrl: 'https://app/ok',
          cancelUrl: 'https://app/no',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('provisions a Stripe customer on first checkout', async () => {
      billingRepo.findAccountByOrg.mockResolvedValue({
        stripe_account_id: 'acct_1',
        charges_enabled: true,
        platform_fee_bps: 500,
      } as never);
      billingRepo.findPriceByStripeId.mockResolvedValue({
        organisation_id: ORG,
        active: true,
        stripe_price_id: 'price_1',
      } as never);
      membershipRepo.findByUserAndOrg.mockResolvedValue({
        role: OrganisationRole.ATHLETE,
      } as never);
      billingRepo.findCustomer.mockResolvedValue(undefined);
      userRepo.findById.mockResolvedValue({
        id: USER,
        email: 'a@b.com',
        display_name: 'Alice',
      } as never);
      stripeService.createCustomer.mockResolvedValue({ id: 'cus_new' } as never);
      billingRepo.createCustomer.mockResolvedValue({
        stripe_customer_id: 'cus_new',
      } as never);
      stripeService.createCheckoutSession.mockResolvedValue({
        id: 'cs_1',
        url: 'https://stripe/checkout/cs_1',
      } as never);

      const res = await service.createCheckoutSession(ORG, USER, {
        priceId: 'price_1',
        successUrl: 'https://app/ok',
        cancelUrl: 'https://app/no',
      });

      expect(stripeService.createCustomer).toHaveBeenCalledWith('acct_1', {
        email: 'a@b.com',
        name: 'Alice',
        metadata: { organisation_id: ORG, user_id: USER },
      });
      expect(billingRepo.createCustomer).toHaveBeenCalled();
      // platformFeeBps=500 → 5% → applicationFeePercent=5
      expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
        'acct_1',
        expect.objectContaining({ applicationFeePercent: 5 }),
      );
      expect(res.data.url).toBe('https://stripe/checkout/cs_1');
    });
  });

  describe('createBillingPortalSession', () => {
    it('refuses when the client has no Stripe customer yet', async () => {
      billingRepo.findAccountByOrg.mockResolvedValue({
        stripe_account_id: 'acct_1',
        charges_enabled: true,
        platform_fee_bps: 500,
      } as never);
      membershipRepo.findByUserAndOrg.mockResolvedValue({
        role: OrganisationRole.ATHLETE,
      } as never);
      billingRepo.findCustomer.mockResolvedValue(undefined);

      await expect(
        service.createBillingPortalSession(ORG, USER, { returnUrl: 'https://app/back' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getClientSubscription', () => {
    it('returns { data: null } for clients with no active subscription', async () => {
      membershipRepo.findByUserAndOrg.mockResolvedValue({
        role: OrganisationRole.ATHLETE,
      } as never);
      billingRepo.findSubscriptionForUser.mockResolvedValue(undefined);

      const res = await service.getClientSubscription(ORG, USER);
      expect(res).toEqual({ data: null });
    });
  });
});
