import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';

import { OrganisationRole } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { StripeService } from 'src/modules/stripe/stripe.service';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { OrganisationRepository } from 'src/repositories/organisation.repository';
// `OrganisationRepository` is referenced as the DI token only; we don't dereference
// its instance members in the tests.
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { BillingApiService } from './billing-api.service';

/**
 * Unit-level coverage of the admin billing surface. Mocks everything below the
 * service so we can verify guard sequencing (admin → connected) and the
 * Stripe-first write pattern (call Stripe, then mirror).
 */
const ORG = 'org-1';
const USER = 'user-1';

const req = { user: { id: USER } as AuthUser } as Request & { user: AuthUser };

describe('BillingApiService', () => {
  let service: BillingApiService;
  let membershipRepo: jest.Mocked<OrganisationMembershipRepository>;
  let billingRepo: jest.Mocked<StripeBillingRepository>;
  let stripeService: jest.Mocked<StripeService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingApiService,
        { provide: OrganisationRepository, useValue: {} },
        {
          provide: OrganisationMembershipRepository,
          useValue: { hasRole: jest.fn() },
        },
        {
          provide: StripeBillingRepository,
          useValue: {
            findAccountByOrg: jest.fn(),
            createAccount: jest.fn(),
            updateAccount: jest.fn(),
            listProducts: jest.fn(),
            findProduct: jest.fn(),
            createProduct: jest.fn(),
            updateProductByStripeId: jest.fn(),
            listPrices: jest.fn(),
            findPrice: jest.fn(),
            createPrice: jest.fn(),
            updatePriceByStripeId: jest.fn(),
            listCoupons: jest.fn(),
            findCoupon: jest.fn(),
            createCoupon: jest.fn(),
            deactivateCoupon: jest.fn(),
            listSubscriptionsForOrg: jest.fn(),
          },
        },
        {
          provide: StripeService,
          useValue: {
            createConnectAccount: jest.fn(),
            createAccountLink: jest.fn(),
            retrieveAccount: jest.fn(),
            createLoginLink: jest.fn(),
            createProduct: jest.fn(),
            archiveProduct: jest.fn(),
            createPrice: jest.fn(),
            archivePrice: jest.fn(),
            createCoupon: jest.fn(),
            createPromotionCode: jest.fn(),
            deleteCoupon: jest.fn(),
            createRefund: jest.fn(),
          },
        },
        { provide: AppConfigService, useValue: {} },
        {
          // ensureAdmin consults this only as a fallback when membership
          // check fails — every test in this spec exercises the member
          // path, so an empty role list is correct.
          provide: UserRepository,
          useValue: { findRolesByUserId: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get(BillingApiService);
    membershipRepo = module.get(OrganisationMembershipRepository);
    billingRepo = module.get(StripeBillingRepository);
    stripeService = module.get(StripeService);
  });

  describe('admin gate', () => {
    it('rejects callers without owner/admin role', async () => {
      membershipRepo.hasRole.mockResolvedValue(false);

      await expect(service.getAccount(req, ORG)).rejects.toBeInstanceOf(ForbiddenException);
      expect(membershipRepo.hasRole).toHaveBeenCalledWith(USER, ORG, [
        OrganisationRole.OWNER,
        OrganisationRole.ADMIN,
      ]);
    });

    it('returns { data: null } when the org has no Connect account yet', async () => {
      membershipRepo.hasRole.mockResolvedValue(true);
      billingRepo.findAccountByOrg.mockResolvedValue(undefined);

      const res = await service.getAccount(req, ORG);
      expect(res).toEqual({ data: null });
    });
  });

  describe('startOnboarding', () => {
    it('creates a Stripe Express account on first call and mirrors locally', async () => {
      membershipRepo.hasRole.mockResolvedValue(true);
      billingRepo.findAccountByOrg.mockResolvedValue(undefined);
      stripeService.createConnectAccount.mockResolvedValue({
        id: 'acct_123',
        default_currency: 'usd',
        country: 'US',
      } as never);
      stripeService.createAccountLink.mockResolvedValue({
        url: 'https://stripe/onboard',
        expires_at: 1900000000,
      } as never);

      const res = await service.startOnboarding(req, ORG, { returnUrl: 'https://app/return' });

      expect(stripeService.createConnectAccount).toHaveBeenCalled();
      expect(billingRepo.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({ organisation_id: ORG, stripe_account_id: 'acct_123' }),
      );
      expect(res.data.url).toBe('https://stripe/onboard');
    });

    it('reuses an existing account row on retry (the "incomplete onboarding" path)', async () => {
      membershipRepo.hasRole.mockResolvedValue(true);
      billingRepo.findAccountByOrg.mockResolvedValue({
        stripe_account_id: 'acct_existing',
        organisation_id: ORG,
        platform_fee_bps: 500,
      } as never);
      stripeService.createAccountLink.mockResolvedValue({
        url: 'https://stripe/resume',
        expires_at: 1900000000,
      } as never);

      const res = await service.startOnboarding(req, ORG, { returnUrl: 'https://app/return' });

      expect(stripeService.createConnectAccount).not.toHaveBeenCalled();
      expect(billingRepo.createAccount).not.toHaveBeenCalled();
      expect(stripeService.createAccountLink).toHaveBeenCalledWith(
        expect.objectContaining({ stripeAccountId: 'acct_existing' }),
      );
      expect(res.data.url).toBe('https://stripe/resume');
    });
  });

  describe('createProduct', () => {
    it('refuses when the org has no Connect account', async () => {
      membershipRepo.hasRole.mockResolvedValue(true);
      billingRepo.findAccountByOrg.mockResolvedValue(undefined);

      await expect(
        service.createProduct(req, ORG, { name: 'Coaching' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('calls Stripe first, then mirrors the resulting id locally', async () => {
      membershipRepo.hasRole.mockResolvedValue(true);
      billingRepo.findAccountByOrg.mockResolvedValue({
        stripe_account_id: 'acct_123',
        organisation_id: ORG,
        platform_fee_bps: 500,
      } as never);
      stripeService.createProduct.mockResolvedValue({ id: 'prod_999' } as never);
      billingRepo.createProduct.mockResolvedValue({
        id: 'local-uuid',
        stripe_product_id: 'prod_999',
        name: 'Coaching',
        description: null,
        active: true,
        created_at: new Date(),
      } as never);

      const res = await service.createProduct(req, ORG, { name: 'Coaching' });

      expect(stripeService.createProduct).toHaveBeenCalledBefore(
        billingRepo.createProduct as unknown as jest.Mock,
      );
      expect(billingRepo.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({ stripe_product_id: 'prod_999' }),
      );
      expect(res.data.stripeProductId).toBe('prod_999');
    });
  });

  describe('createCoupon', () => {
    beforeEach(() => {
      membershipRepo.hasRole.mockResolvedValue(true);
      billingRepo.findAccountByOrg.mockResolvedValue({
        stripe_account_id: 'acct_123',
        organisation_id: ORG,
        platform_fee_bps: 500,
      } as never);
    });

    it('requires exactly one of percentOff or amountOff', async () => {
      await expect(
        service.createCoupon(req, ORG, {
          percentOff: 10,
          amountOff: 500,
          duration: 'once',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires durationInMonths when duration=repeating', async () => {
      await expect(
        service.createCoupon(req, ORG, { percentOff: 10, duration: 'repeating' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('mints a promotion code when code is supplied', async () => {
      stripeService.createCoupon.mockResolvedValue({ id: 'coup_xyz' } as never);
      stripeService.createPromotionCode.mockResolvedValue({ id: 'promo_abc' } as never);
      billingRepo.createCoupon.mockResolvedValue({
        id: 'local',
        stripe_coupon_id: 'coup_xyz',
        stripe_promotion_code_id: 'promo_abc',
        code: 'WELCOME',
        percent_off: 10,
        amount_off: null,
        currency: null,
        duration: 'once',
        duration_in_months: null,
        max_redemptions: null,
        redeem_by: null,
        active: true,
        created_at: new Date(),
      } as never);

      const res = await service.createCoupon(req, ORG, {
        percentOff: 10,
        duration: 'once',
        code: 'WELCOME',
      });

      expect(stripeService.createPromotionCode).toHaveBeenCalledWith('acct_123', {
        couponId: 'coup_xyz',
        code: 'WELCOME',
      });
      expect(res.data.stripePromotionCodeId).toBe('promo_abc');
    });

    it('maps "resource_already_exists" into 409 Conflict', async () => {
      stripeService.createCoupon.mockResolvedValue({ id: 'coup_xyz' } as never);
      stripeService.createPromotionCode.mockRejectedValue({ code: 'resource_already_exists' });

      await expect(
        service.createCoupon(req, ORG, { percentOff: 10, duration: 'once', code: 'WELCOME' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('archiveProduct', () => {
    it('throws 404 when the product is not in this org', async () => {
      membershipRepo.hasRole.mockResolvedValue(true);
      billingRepo.findAccountByOrg.mockResolvedValue({
        stripe_account_id: 'acct_123',
        organisation_id: ORG,
        platform_fee_bps: 500,
      } as never);
      billingRepo.findProduct.mockResolvedValue(undefined);

      await expect(service.archiveProduct(req, ORG, 'prod-uuid')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

// jest-extended `toHaveBeenCalledBefore` shim. Tests in this codebase don't depend on
// `jest-extended` so we provide a minimal fallback that works on jest.Mock objects.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toHaveBeenCalledBefore(other: jest.Mock): R;
    }
  }
}
expect.extend({
  toHaveBeenCalledBefore(received: jest.Mock, other: jest.Mock) {
    const r = received.mock.invocationCallOrder[0];
    const o = other.mock.invocationCallOrder[0];
    const pass = typeof r === 'number' && typeof o === 'number' && r < o;
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received.getMockName()} not to be called before ${other.getMockName()}`
          : `expected ${received.getMockName()} to be called before ${other.getMockName()}, got orders ${r} and ${o}`,
    };
  },
});
