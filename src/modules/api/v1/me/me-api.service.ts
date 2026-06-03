import { Injectable, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Request } from 'express';

import {
  ContentItemKind,
  ContentItemStatus,
  CourseStatus,
  Database,
  EntitlementResourceType,
  WorkoutVisibility,
} from 'src/database/interfaces';
import { S3Service } from 'src/modules/s3/s3.service';
import { ResourceEntitlementsRepository } from 'src/repositories/resource-entitlements.repository';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { PublicBillingService } from '../public/billing/public-billing.service';
import type { AuthUser } from 'src/modules/auth/types/authenticated-user';
import type { ActiveOrgContext } from 'src/modules/auth/guards/active-org.guard';

import {
  DeviceTokenAckResponse,
  FeaturedContentResponse,
  FeaturedItemDTO,
  FeaturedItemKind,
  MyEntitlementsResponse,
  MyProductDTO,
} from './response.dto';
import { ListFeaturedContentQuery, RegisterDeviceTokenBody } from './request.dto';

type AuthedReq = Request & { user: AuthUser; activeOrg?: ActiveOrgContext };

/**
 * Read-side controller for the currently-authenticated user. Lives at
 * /v1/me/* and is the surface a third-party client app (rehabit) +
 * our first-party athlete app both hit for entitlements / featured
 * content / device-token registration.
 *
 * Org scoping comes from the X-Organisation-Id header (resolved into
 * req.activeOrg by ActiveOrgGuard). All queries are tenant-bounded.
 */
@Injectable()
export class MeApiService {
  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly s3: S3Service,
    private readonly userRepo: UserRepository,
    private readonly billingRepo: StripeBillingRepository,
    private readonly entitlementsRepo: ResourceEntitlementsRepository,
    private readonly publicBilling: PublicBillingService,
  ) {}

  // --------------------------------------------------------------------------
  // Billing flow — delegates to PublicBillingService so /v1/me/* and
  // /v1/public/clients/:id/* converge on one Stripe call path.
  // --------------------------------------------------------------------------

  /** Active products in the org's catalogue (subscribe-tab list). */
  async listProducts(req: AuthedReq) {
    const orgId = this.requireOrg(req);
    return this.publicBilling.listProducts(orgId, { includeInactive: false });
  }

  async createCheckoutSession(
    req: AuthedReq,
    body: { priceId: string; successUrl: string; cancelUrl: string; promotionCodeId?: string },
  ) {
    const orgId = this.requireOrg(req);
    return this.publicBilling.createCheckoutSession(orgId, req.user.id, body);
  }

  async createBillingPortalSession(
    req: AuthedReq,
    body: { returnUrl: string },
  ) {
    const orgId = this.requireOrg(req);
    return this.publicBilling.createBillingPortalSession(orgId, req.user.id, body);
  }

  /** Current subscription (any-of-active product) or null. */
  async getMySubscription(req: AuthedReq) {
    const orgId = this.requireOrg(req);
    return this.publicBilling.getClientSubscription(orgId, req.user.id);
  }

  private requireOrg(req: AuthedReq): string {
    const orgId = req.activeOrg?.organisationId;
    if (!orgId) throw new NotFoundException('Active organisation required');
    return orgId;
  }

  // --------------------------------------------------------------------------
  // Entitlements roll-up
  // --------------------------------------------------------------------------

  /**
   * "What does this user own and what does that unlock?"
   *
   * Two parts:
   *   - products: the active stripe_products the user holds (one entry
   *     per distinct product, deduped across multi-subscription users).
   *   - unlockedResources: reverse-indexed bucket of resource ids
   *     (workout / course / content_item) the user can play without
   *     hitting a paywall.
   *
   * Free resources (those with zero resource_entitlements rows) are
   * NOT included in unlockedResources — the client treats anything
   * not in the list as "needs a lock check on detail", and the detail
   * endpoint returns it free. Listing every free resource here would
   * balloon the payload and the client doesn't need it.
   */
  async getEntitlements(req: AuthedReq): Promise<MyEntitlementsResponse> {
    const orgId = req.activeOrg?.organisationId;
    if (!orgId) {
      // ActiveOrgGuard normally catches this — defensive check for any
      // controller path that forgets to require it.
      throw new NotFoundException('Active organisation required');
    }

    // 1. user's active product ids → 2. products by id → 3. reverse-
    // index resource ids gated by those products.
    const productIds = await this.billingRepo.listActiveProductIdsForUser(req.user.id);

    let products: MyProductDTO[] = [];
    if (productIds.length > 0) {
      const rows = await this.db
        .selectFrom('stripe_products')
        .where('id', 'in', productIds)
        .where('organisation_id', '=', orgId)
        .select(['id', 'name', 'description', 'active'])
        .execute();
      products = rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        active: r.active,
      }));
    }

    const unlocked = await this.entitlementsRepo.listResourcesByProducts(orgId, productIds);
    return {
      data: {
        products,
        unlockedResources: {
          workout: unlocked.get('workout') ?? [],
          course: unlocked.get('course') ?? [],
          content_item: unlocked.get('content_item') ?? [],
        },
      },
    };
  }

  // --------------------------------------------------------------------------
  // Featured content
  // --------------------------------------------------------------------------

  /**
   * Aggregated "what's hot right now" feed across the four content
   * surfaces. Each kind is queried independently with the same
   * featured-window predicate and capped at `limit`; results are
   * concatenated. Empty-kind subsets are omitted, not zero-padded.
   *
   * Used by:
   *   - rehabit + athlete home page carousel
   *   - "Featured" tab on the org-app library (admin preview of what
   *     the client currently sees)
   */
  async listFeatured(
    req: AuthedReq,
    query: ListFeaturedContentQuery,
  ): Promise<FeaturedContentResponse> {
    const orgId = req.activeOrg?.organisationId;
    if (!orgId) {
      throw new NotFoundException('Active organisation required');
    }

    const requested = new Set<FeaturedItemKind>(
      (query.kinds?.split(',').map((s) => s.trim().toLowerCase()) as FeaturedItemKind[]) ?? [
        FeaturedItemKind.WORKOUT,
        FeaturedItemKind.COURSE,
        FeaturedItemKind.SNACK,
        FeaturedItemKind.PLAN,
      ],
    );

    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '12', 10) || 12));

    const out: FeaturedItemDTO[] = [];

    if (requested.has(FeaturedItemKind.WORKOUT)) {
      const rows = await this.db
        .selectFrom('workouts')
        .where('organisation_id', '=', orgId)
        .where('visibility', '=', WorkoutVisibility.ORG_LIBRARY)
        // Raw SQL for the featured-window predicate: Kysely's strict
        // ColumnType for our nullable TIMESTAMPTZ columns won't accept
        // a JS Date directly in eb('col', '<=', date). Same predicate
        // across all four resource tables; centralised so a tweak (e.g.
        // grace period) lands in one place. NOW() is server-time and
        // matches the partial-index expression on featured_until.
        .where(sql<boolean>`
          (featured_from IS NULL OR featured_from <= NOW())
          AND (featured_until IS NULL OR featured_until > NOW())
          AND (featured_from IS NOT NULL OR featured_until IS NOT NULL)
        `)
        .select(['id', 'name', 'description', 'featured_from', 'featured_until'])
        .orderBy('featured_from', 'desc')
        .limit(limit)
        .execute();
      for (const r of rows) {
        out.push({
          kind: FeaturedItemKind.WORKOUT,
          id: r.id,
          title: r.name,
          description: r.description,
          coverUrl: null, // workouts have no first-class cover today
          featuredFrom: toIso(r.featured_from),
          featuredUntil: toIso(r.featured_until),
          locked: false, // stamped below in one batch
        });
      }
    }

    if (requested.has(FeaturedItemKind.COURSE)) {
      const rows = await this.db
        .selectFrom('courses')
        .where('organisation_id', '=', orgId)
        .where('status', '=', CourseStatus.PUBLISHED)
        // Raw SQL for the featured-window predicate: Kysely's strict
        // ColumnType for our nullable TIMESTAMPTZ columns won't accept
        // a JS Date directly in eb('col', '<=', date). Same predicate
        // across all four resource tables; centralised so a tweak (e.g.
        // grace period) lands in one place. NOW() is server-time and
        // matches the partial-index expression on featured_until.
        .where(sql<boolean>`
          (featured_from IS NULL OR featured_from <= NOW())
          AND (featured_until IS NULL OR featured_until > NOW())
          AND (featured_from IS NOT NULL OR featured_until IS NOT NULL)
        `)
        .select([
          'id', 'title', 'description', 'cover_s3_bucket', 'cover_s3_key',
          'featured_from', 'featured_until',
        ])
        .orderBy('featured_from', 'desc')
        .limit(limit)
        .execute();
      for (const r of rows) {
        out.push({
          kind: FeaturedItemKind.COURSE,
          id: r.id,
          title: r.title,
          description: r.description,
          coverUrl: await this.signCover(r.cover_s3_bucket, r.cover_s3_key),
          featuredFrom: toIso(r.featured_from),
          featuredUntil: toIso(r.featured_until),
          locked: false,
        });
      }
    }

    if (requested.has(FeaturedItemKind.SNACK)) {
      const rows = await this.db
        .selectFrom('content_items')
        .where('organisation_id', '=', orgId)
        .where('kind', '=', ContentItemKind.SNACK)
        .where('status', '=', ContentItemStatus.READY)
        // Raw SQL for the featured-window predicate: Kysely's strict
        // ColumnType for our nullable TIMESTAMPTZ columns won't accept
        // a JS Date directly in eb('col', '<=', date). Same predicate
        // across all four resource tables; centralised so a tweak (e.g.
        // grace period) lands in one place. NOW() is server-time and
        // matches the partial-index expression on featured_until.
        .where(sql<boolean>`
          (featured_from IS NULL OR featured_from <= NOW())
          AND (featured_until IS NULL OR featured_until > NOW())
          AND (featured_from IS NOT NULL OR featured_until IS NOT NULL)
        `)
        .select([
          'id', 'title', 'description',
          'thumbnail_s3_bucket', 'thumbnail_s3_key',
          'featured_from', 'featured_until',
        ])
        .orderBy('featured_from', 'desc')
        .limit(limit)
        .execute();
      for (const r of rows) {
        out.push({
          kind: FeaturedItemKind.SNACK,
          id: r.id,
          title: r.title,
          description: r.description,
          coverUrl: await this.signCover(r.thumbnail_s3_bucket, r.thumbnail_s3_key),
          featuredFrom: toIso(r.featured_from),
          featuredUntil: toIso(r.featured_until),
          locked: false,
        });
      }
    }

    if (requested.has(FeaturedItemKind.PLAN)) {
      const rows = await this.db
        .selectFrom('workout_plans')
        .where('organisation_id', '=', orgId)
        // Raw SQL for the featured-window predicate: Kysely's strict
        // ColumnType for our nullable TIMESTAMPTZ columns won't accept
        // a JS Date directly in eb('col', '<=', date). Same predicate
        // across all four resource tables; centralised so a tweak (e.g.
        // grace period) lands in one place. NOW() is server-time and
        // matches the partial-index expression on featured_until.
        .where(sql<boolean>`
          (featured_from IS NULL OR featured_from <= NOW())
          AND (featured_until IS NULL OR featured_until > NOW())
          AND (featured_from IS NOT NULL OR featured_until IS NOT NULL)
        `)
        .select(['id', 'name', 'description', 'featured_from', 'featured_until'])
        .orderBy('featured_from', 'desc')
        .limit(limit)
        .execute();
      for (const r of rows) {
        out.push({
          kind: FeaturedItemKind.PLAN,
          id: r.id,
          title: r.name,
          description: r.description,
          coverUrl: null,
          featuredFrom: toIso(r.featured_from),
          featuredUntil: toIso(r.featured_until),
          locked: false,
        });
      }
    }

    // Stamp lock status in batch per resource kind. Skipping plans —
    // they're not first-class entitlement resources today (the items
    // inside the plan are gated individually).
    await this.stampLockStatus(req.user.id, orgId, out);

    return { data: out };
  }

  /**
   * Mutates each item.locked in place. Batches per resource_type to
   * keep this O(kinds) round-trips.
   */
  private async stampLockStatus(
    userId: string,
    orgId: string,
    items: FeaturedItemDTO[],
  ): Promise<void> {
    const productIds = await this.billingRepo.listActiveProductIdsForUser(userId);
    const unlocked = await this.entitlementsRepo.listResourcesByProducts(orgId, productIds);

    // For each item, look up its entitlement set and check if user has any.
    // Resources with zero entitlements are free → unlocked.
    const groups = new Map<EntitlementResourceType, FeaturedItemDTO[]>();
    for (const item of items) {
      const rt = mapKindToResourceType(item.kind);
      if (!rt) {
        item.locked = false; // plans treated as always-visible at the carousel level
        continue;
      }
      const list = groups.get(rt) ?? [];
      list.push(item);
      groups.set(rt, list);
    }

    for (const [rt, list] of groups) {
      const ids = list.map((i) => i.id);
      const reqMap = await this.entitlementsRepo.listForResources(rt, ids);
      const userUnlocks = new Set(unlocked.get(rt) ?? []);
      for (const item of list) {
        const required = reqMap.get(item.id) ?? [];
        if (required.length === 0) {
          item.locked = false; // free resource
        } else {
          item.locked = !userUnlocks.has(item.id);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Device-token register / unregister
  // --------------------------------------------------------------------------

  async registerDeviceToken(req: AuthedReq, body: RegisterDeviceTokenBody): Promise<DeviceTokenAckResponse> {
    await this.userRepo.addFcmToken(req.user.id, body.token);
    const fresh = await this.userRepo.findById(req.user.id);
    return { data: { count: fresh?.fcm_tokens?.length ?? 0 } };
  }

  async unregisterDeviceToken(req: AuthedReq, body: RegisterDeviceTokenBody): Promise<DeviceTokenAckResponse> {
    await this.userRepo.removeFcmToken(req.user.id, body.token);
    const fresh = await this.userRepo.findById(req.user.id);
    return { data: { count: fresh?.fcm_tokens?.length ?? 0 } };
  }

  // --------------------------------------------------------------------------

  private async signCover(bucket: string | null, key: string | null): Promise<string | null> {
    if (!bucket || !key) return null;
    return this.s3.getSignedUrlGET({ bucket, key, expires: 3600 });
  }
}

function toIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function mapKindToResourceType(k: FeaturedItemKind): EntitlementResourceType | null {
  switch (k) {
    case FeaturedItemKind.WORKOUT:
      return 'workout';
    case FeaturedItemKind.COURSE:
      return 'course';
    case FeaturedItemKind.SNACK:
      return 'content_item';
    case FeaturedItemKind.PLAN:
      return null;
  }
}
