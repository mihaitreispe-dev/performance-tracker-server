import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { CourseRepository } from 'src/repositories/course.repository';
import { ResourceEntitlementsRepository } from 'src/repositories/resource-entitlements.repository';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';

import { EntitlementsService, LockedResourceException } from './entitlements.service';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const USER = 'user-1';

function makeProduct(overrides: Partial<{ id: string; organisation_id: string; name: string }> = {}) {
  return {
    id: overrides.id ?? 'p1',
    organisation_id: overrides.organisation_id ?? ORG,
    stripe_product_id: 'prod_x',
    name: overrides.name ?? 'Pro',
    description: null,
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

describe('EntitlementsService', () => {
  let service: EntitlementsService;
  let entitlementsRepo: jest.Mocked<ResourceEntitlementsRepository>;
  let billingRepo: jest.Mocked<StripeBillingRepository>;
  let workoutRepo: jest.Mocked<WorkoutRepository>;
  let courseRepo: jest.Mocked<CourseRepository>;
  let contentItemRepo: jest.Mocked<ContentItemRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EntitlementsService,
        {
          provide: ResourceEntitlementsRepository,
          useValue: {
            listForResource: jest.fn(),
            listForResources: jest.fn(),
            replaceForResource: jest.fn(),
            userHasAccess: jest.fn(),
          },
        },
        {
          provide: StripeBillingRepository,
          useValue: {
            findProductById: jest.fn(),
            listActivePricesForProducts: jest.fn(),
            listActiveProductIdsForUser: jest.fn(),
          },
        },
        {
          provide: WorkoutRepository,
          useValue: { findById: jest.fn() },
        },
        {
          provide: CourseRepository,
          useValue: { findById: jest.fn() },
        },
        {
          provide: ContentItemRepository,
          useValue: { findById: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(EntitlementsService);
    entitlementsRepo = module.get(ResourceEntitlementsRepository);
    billingRepo = module.get(StripeBillingRepository);
    workoutRepo = module.get(WorkoutRepository);
    courseRepo = module.get(CourseRepository);
    contentItemRepo = module.get(ContentItemRepository);
  });

  describe('getLockStatus', () => {
    it('returns free when no entitlement rows exist', async () => {
      entitlementsRepo.listForResource.mockResolvedValue([]);
      const out = await service.getLockStatus(USER, 'workout', 'w1');
      expect(out).toEqual({ locked: false, requiredTiers: [] });
    });

    it('is locked for an anonymous caller (userId=null) if any tier is required', async () => {
      const product = makeProduct();
      entitlementsRepo.listForResource.mockResolvedValue([
        { id: 'e1', organisation_id: ORG, resource_type: 'workout', resource_id: 'w1', stripe_product_id: 'p1', created_at: new Date(), updated_at: new Date(), product },
      ] as never);
      billingRepo.listActivePricesForProducts.mockResolvedValue([]);

      const out = await service.getLockStatus(null, 'workout', 'w1');
      expect(out.locked).toBe(true);
      expect(out.requiredTiers).toHaveLength(1);
    });

    it('is unlocked when the user has an active subscription matching any required tier', async () => {
      const product = makeProduct();
      entitlementsRepo.listForResource.mockResolvedValue([
        { id: 'e1', organisation_id: ORG, resource_type: 'workout', resource_id: 'w1', stripe_product_id: 'p1', created_at: new Date(), updated_at: new Date(), product },
      ] as never);
      billingRepo.listActivePricesForProducts.mockResolvedValue([]);
      entitlementsRepo.userHasAccess.mockResolvedValue(true);

      const out = await service.getLockStatus(USER, 'workout', 'w1');
      expect(out.locked).toBe(false);
      expect(out.requiredTiers).toHaveLength(1);
    });

    it('picks the cheapest active price as the UI hint', async () => {
      const product = makeProduct();
      entitlementsRepo.listForResource.mockResolvedValue([
        { id: 'e1', organisation_id: ORG, resource_type: 'workout', resource_id: 'w1', stripe_product_id: 'p1', created_at: new Date(), updated_at: new Date(), product },
      ] as never);
      billingRepo.listActivePricesForProducts.mockResolvedValue([
        { stripe_price_id: 'price_year', stripe_product_id: 'prod_x', unit_amount: 9000, currency: 'usd', interval: 'year' },
        { stripe_price_id: 'price_month', stripe_product_id: 'prod_x', unit_amount: 999, currency: 'usd', interval: 'month' },
      ] as never);
      entitlementsRepo.userHasAccess.mockResolvedValue(false);

      const out = await service.getLockStatus(USER, 'workout', 'w1');
      expect(out.requiredTiers[0].cheapestPrice).toMatchObject({
        stripePriceId: 'price_month',
        unitAmount: 999,
      });
    });
  });

  describe('assertAccess', () => {
    it('404s when the resource belongs to a different org', async () => {
      workoutRepo.findById.mockResolvedValue({ id: 'w1', organisation_id: OTHER_ORG } as never);
      await expect(
        service.assertAccess({ organisationId: ORG, userId: USER, resourceType: 'workout', resourceId: 'w1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws a 402 LockedResourceException with the tier payload when access is denied', async () => {
      workoutRepo.findById.mockResolvedValue({ id: 'w1', organisation_id: ORG } as never);
      const product = makeProduct();
      entitlementsRepo.listForResource.mockResolvedValue([
        { id: 'e1', organisation_id: ORG, resource_type: 'workout', resource_id: 'w1', stripe_product_id: 'p1', created_at: new Date(), updated_at: new Date(), product },
      ] as never);
      billingRepo.listActivePricesForProducts.mockResolvedValue([]);
      entitlementsRepo.userHasAccess.mockResolvedValue(false);

      await expect(
        service.assertAccess({ organisationId: ORG, userId: USER, resourceType: 'workout', resourceId: 'w1' }),
      ).rejects.toBeInstanceOf(LockedResourceException);
    });

    it('returns lock status without throwing when the user has access', async () => {
      workoutRepo.findById.mockResolvedValue({ id: 'w1', organisation_id: ORG } as never);
      entitlementsRepo.listForResource.mockResolvedValue([]);

      const out = await service.assertAccess({
        organisationId: ORG,
        userId: USER,
        resourceType: 'workout',
        resourceId: 'w1',
      });
      expect(out).toEqual({ locked: false, requiredTiers: [] });
    });
  });

  describe('setEntitlementsForResource', () => {
    it("refuses to attach a product that doesn't belong to the same org", async () => {
      workoutRepo.findById.mockResolvedValue({ id: 'w1', organisation_id: ORG } as never);
      billingRepo.findProductById.mockResolvedValue(makeProduct({ organisation_id: OTHER_ORG }) as never);

      await expect(
        service.setEntitlementsForResource({
          organisationId: ORG,
          resourceType: 'workout',
          resourceId: 'w1',
          stripeProductIds: ['p1'],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Crucially: the replace call should NOT have happened. Cross-tenant
      // attach would create a row that survives the cascade-on-delete
      // invariant only by accident.
      expect(entitlementsRepo.replaceForResource).not.toHaveBeenCalled();
    });

    it('clears the gate when called with an empty product list', async () => {
      workoutRepo.findById.mockResolvedValue({ id: 'w1', organisation_id: ORG } as never);
      entitlementsRepo.replaceForResource.mockResolvedValue([]);
      entitlementsRepo.listForResource.mockResolvedValue([]);

      const out = await service.setEntitlementsForResource({
        organisationId: ORG,
        resourceType: 'workout',
        resourceId: 'w1',
        stripeProductIds: [],
      });
      expect(entitlementsRepo.replaceForResource).toHaveBeenCalledWith(ORG, 'workout', 'w1', []);
      expect(out).toEqual([]);
    });
  });

  describe('getLockStatusMap', () => {
    it('returns FREE entries for resources with no entitlements', async () => {
      entitlementsRepo.listForResources.mockResolvedValue(new Map());
      billingRepo.listActiveProductIdsForUser.mockResolvedValue([]);

      const out = await service.getLockStatusMap(USER, 'workout', ['w1', 'w2']);
      expect(out.get('w1')).toEqual({ locked: false, requiredTiers: [] });
      expect(out.get('w2')).toEqual({ locked: false, requiredTiers: [] });
    });

    it('marks resources unlocked when the user has any matching active product', async () => {
      const product = makeProduct();
      entitlementsRepo.listForResources.mockResolvedValue(
        new Map([
          [
            'w1',
            [
              {
                id: 'e1',
                organisation_id: ORG,
                resource_type: 'workout',
                resource_id: 'w1',
                stripe_product_id: 'p1',
                created_at: new Date(),
                updated_at: new Date(),
                product,
              },
            ],
          ],
        ]) as never,
      );
      billingRepo.listActivePricesForProducts.mockResolvedValue([]);
      billingRepo.listActiveProductIdsForUser.mockResolvedValue(['p1']);

      const out = await service.getLockStatusMap(USER, 'workout', ['w1']);
      expect(out.get('w1')?.locked).toBe(false);
      expect(out.get('w1')?.requiredTiers).toHaveLength(1);
    });
  });
});
