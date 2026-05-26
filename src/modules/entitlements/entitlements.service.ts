import { ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';

import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { CourseRepository } from 'src/repositories/course.repository';
import { ResourceEntitlementsRepository } from 'src/repositories/resource-entitlements.repository';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';

import { EntitlementResourceType } from 'src/database/interfaces';

/**
 * Shape returned to consumers describing a tier the resource is gated
 * behind. Trimmed down from the full StripeProduct row + a representative
 * recurring price (the cheapest active one in the product's currency, as
 * a UI hint — full price list still available via /public/products).
 */
export interface RequiredTierDTO {
  /** Local stripe_products.id — what admin endpoints reference. */
  id: string;
  /** Bare Stripe product id — useful for clients that already cache Stripe data. */
  stripeProductId: string;
  name: string;
  description: string | null;
  /** Cheapest active recurring price for at-a-glance "$X/mo" UI. Null if no active price yet. */
  cheapestPrice: {
    stripePriceId: string;
    unitAmount: number;
    currency: string;
    interval: string;
  } | null;
}

export interface LockStatusDTO {
  /** True iff the resource has any entitlement rows AND the calling user (if any) lacks access. */
  locked: boolean;
  /**
   * Tier metadata. Empty array means the resource is freely accessible.
   * Populated regardless of `locked` so the client can render
   * "Included with [Pro tier]" badges on accessible-but-gated items.
   */
  requiredTiers: RequiredTierDTO[];
}

/**
 * Central authority for "can this user see this resource?" decisions.
 * Pulled out of PublicApiService into its own module so the admin
 * surface (entitlement CRUD) and the public surface (gating) share one
 * implementation — and so the resource-id → org check can be reused
 * across resource kinds without copy-pasting three nearly-identical
 * "find row, assert tenant" blocks.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly entitlementsRepo: ResourceEntitlementsRepository,
    private readonly stripeBillingRepo: StripeBillingRepository,
    private readonly workoutRepo: WorkoutRepository,
    private readonly courseRepo: CourseRepository,
    private readonly contentItemRepo: ContentItemRepository,
  ) {}

  /**
   * Compute lock status for a single resource. If `userId` is null the
   * caller is anonymous (browsing the catalogue with just an API key) —
   * we still return `requiredTiers` so the consumer can show a lock icon
   * on cards, but `locked` will be true whenever any tier is required.
   *
   * If `userId` is provided we resolve their active subscriptions and
   * flip `locked` to false when there's a match. Throws nothing — a
   * missing resource is the caller's problem to detect upstream.
   */
  async getLockStatus(
    userId: string | null,
    resourceType: EntitlementResourceType,
    resourceId: string,
  ): Promise<LockStatusDTO> {
    const entitlements = await this.entitlementsRepo.listForResource(resourceType, resourceId);
    if (entitlements.length === 0) {
      return { locked: false, requiredTiers: [] };
    }

    const requiredTiers = await this.hydrateTiers(entitlements.map((e) => e.product));
    if (!userId) {
      return { locked: true, requiredTiers };
    }

    const hasAccess = await this.entitlementsRepo.userHasAccess(userId, resourceType, resourceId);
    return { locked: !hasAccess, requiredTiers };
  }

  /**
   * Batch variant — used by list endpoints so we can stamp every row's
   * lock status without an N+1 query storm. Returns a Map keyed by
   * resourceId for cheap consumer-side joins.
   */
  async getLockStatusMap(
    userId: string | null,
    resourceType: EntitlementResourceType,
    resourceIds: string[],
  ): Promise<Map<string, LockStatusDTO>> {
    const out = new Map<string, LockStatusDTO>();
    if (resourceIds.length === 0) return out;

    const byResource = await this.entitlementsRepo.listForResources(resourceType, resourceIds);

    // Hydrate every distinct product once and reuse the dehydrated form
    // across rows that share it. Two passes: collect → hydrate → assign.
    const distinctProducts = new Map<string, ReturnType<typeof Map.prototype.get>>();
    for (const entries of byResource.values()) {
      for (const e of entries) {
        distinctProducts.set(e.product.id, e.product);
      }
    }
    const hydratedByProductId = new Map<string, RequiredTierDTO>();
    const hydrated = await this.hydrateTiers(
      Array.from(distinctProducts.values()).filter((p): p is NonNullable<typeof p> => !!p),
    );
    for (const tier of hydrated) {
      hydratedByProductId.set(tier.id, tier);
    }

    // For locked-status we either short-circuit on anonymous calls or
    // pre-fetch the user's active product set in one query.
    const userActiveProductIds = userId ? await this.fetchUserActiveProductIds(userId) : new Set<string>();

    for (const resourceId of resourceIds) {
      const entries = byResource.get(resourceId) ?? [];
      if (entries.length === 0) {
        out.set(resourceId, { locked: false, requiredTiers: [] });
        continue;
      }
      const tiers = entries
        .map((e) => hydratedByProductId.get(e.product.id))
        .filter((t): t is RequiredTierDTO => !!t);
      const accessible = userId
        ? entries.some((e) => userActiveProductIds.has(e.product.id))
        : false;
      out.set(resourceId, { locked: !accessible, requiredTiers: tiers });
    }
    return out;
  }

  /**
   * Convenience: load + lock-check + throw the 402 in one call. Detail
   * endpoints use this so the throwing happens at the entitlements
   * boundary instead of leaking conditional flow into every controller.
   *
   * Throws:
   *   - NotFoundException if the resource doesn't exist OR belongs to a
   *     different org (tenant scope is checked here)
   *   - ForbiddenException (mapped to 402 by the global filter — see
   *     LockedResourceException) if the user lacks an active matching
   *     subscription.
   */
  async assertAccess(opts: {
    organisationId: string;
    userId: string | null;
    resourceType: EntitlementResourceType;
    resourceId: string;
  }): Promise<LockStatusDTO> {
    // First confirm the resource exists in this org. Doing the tenant
    // check here keeps every caller from having to repeat the
    // findById + assert pattern.
    const exists = await this.resourceExistsInOrg(
      opts.organisationId,
      opts.resourceType,
      opts.resourceId,
    );
    if (!exists) {
      throw new NotFoundException(`${humanizeKind(opts.resourceType)} not found`);
    }

    const status = await this.getLockStatus(opts.userId, opts.resourceType, opts.resourceId);
    if (status.locked) {
      throw new LockedResourceException(status, opts.resourceType, opts.resourceId);
    }
    return status;
  }

  // -------- admin write path --------

  /**
   * Idempotent replace. Validates that every product belongs to the
   * resource's org (cross-tenant attach would be a privilege escalation
   * — gating with another org's tier is meaningless and breaks the
   * cascade-on-product-delete invariant).
   */
  async setEntitlementsForResource(opts: {
    organisationId: string;
    resourceType: EntitlementResourceType;
    resourceId: string;
    stripeProductIds: string[];
  }): Promise<RequiredTierDTO[]> {
    // Resource ownership check first — refusing to mint entitlement
    // rows for a resource we can't prove belongs to the caller is the
    // safest default.
    const exists = await this.resourceExistsInOrg(
      opts.organisationId,
      opts.resourceType,
      opts.resourceId,
    );
    if (!exists) {
      throw new NotFoundException(`${humanizeKind(opts.resourceType)} not found`);
    }

    if (opts.stripeProductIds.length > 0) {
      const products = await Promise.all(
        opts.stripeProductIds.map((id) => this.stripeBillingRepo.findProductById(id)),
      );
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        if (!p || p.organisation_id !== opts.organisationId) {
          throw new ForbiddenException(
            `Product ${opts.stripeProductIds[i]} does not belong to this organisation`,
          );
        }
      }
    }

    await this.entitlementsRepo.replaceForResource(
      opts.organisationId,
      opts.resourceType,
      opts.resourceId,
      opts.stripeProductIds,
    );

    // Return the hydrated view so the admin UI can rerender without a
    // follow-up GET.
    const fresh = await this.entitlementsRepo.listForResource(opts.resourceType, opts.resourceId);
    return this.hydrateTiers(fresh.map((e) => e.product));
  }

  // -------- private helpers --------

  private async resourceExistsInOrg(
    organisationId: string,
    resourceType: EntitlementResourceType,
    resourceId: string,
  ): Promise<boolean> {
    switch (resourceType) {
      case 'workout': {
        const row = await this.workoutRepo.findById(resourceId);
        return !!row && row.organisation_id === organisationId;
      }
      case 'course': {
        const row = await this.courseRepo.findById(resourceId, organisationId);
        // findById is already org-scoped on this repo, so existence
        // implies tenant ownership. Mirror the shape of the other
        // branches for readability.
        return !!row;
      }
      case 'content_item': {
        const row = await this.contentItemRepo.findById(resourceId);
        return !!row && row.organisation_id === organisationId;
      }
      default: {
        // Exhaustive — adding a new kind forces a compile error here.
        const _exhaustive: never = resourceType;
        return _exhaustive;
      }
    }
  }

  private async hydrateTiers(
    products: Array<{ id: string; stripe_product_id: string; name: string; description: string | null }>,
  ): Promise<RequiredTierDTO[]> {
    if (products.length === 0) return [];

    // Pull the cheapest active price per product in one query. We
    // surface this as a UI hint only — checkout still goes through the
    // full price selection flow.
    const productIds = products.map((p) => p.stripe_product_id);
    const prices = await this.stripeBillingRepo.listActivePricesForProducts(productIds);

    const cheapestByProduct = new Map<string, (typeof prices)[number]>();
    for (const price of prices) {
      const current = cheapestByProduct.get(price.stripe_product_id);
      if (!current || price.unit_amount < current.unit_amount) {
        cheapestByProduct.set(price.stripe_product_id, price);
      }
    }

    return products.map((p) => {
      const cheap = cheapestByProduct.get(p.stripe_product_id);
      return {
        id: p.id,
        stripeProductId: p.stripe_product_id,
        name: p.name,
        description: p.description,
        cheapestPrice: cheap
          ? {
              stripePriceId: cheap.stripe_price_id,
              unitAmount: cheap.unit_amount,
              currency: cheap.currency,
              interval: cheap.interval,
            }
          : null,
      };
    });
  }

  private async fetchUserActiveProductIds(userId: string): Promise<Set<string>> {
    const products = await this.stripeBillingRepo.listActiveProductIdsForUser(userId);
    return new Set(products);
  }
}

/**
 * Custom HTTP 402 (Payment Required) thrown by `assertAccess`. NestJS
 * doesn't ship a PaymentRequiredException so we extend HttpException
 * directly and pin the status to 402. The body carries the structured
 * tier payload so SDK consumers can render a paywall without a second
 * round-trip to look up tier metadata.
 *
 * The `isLockedResource` marker is left in place for any global filter
 * that wants to special-case logging / metrics on paywall hits.
 */
export class LockedResourceException extends HttpException {
  readonly isLockedResource = true;

  constructor(
    public readonly lockStatus: LockStatusDTO,
    public readonly resourceType: EntitlementResourceType,
    public readonly resourceId: string,
  ) {
    super(
      {
        statusCode: 402,
        error: 'Payment Required',
        message: `This ${humanizeKind(resourceType)} requires an active subscription.`,
        resourceType,
        resourceId,
        requiredTiers: lockStatus.requiredTiers,
      },
      402,
    );
  }
}

function humanizeKind(t: EntitlementResourceType): string {
  switch (t) {
    case 'workout':
      return 'workout';
    case 'course':
      return 'course';
    case 'content_item':
      return 'movement snack';
  }
}
