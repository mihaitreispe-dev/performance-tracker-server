import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ContentItem,
  ContentItemKind,
  ContentItemStatus,
  EntitlementResourceType,
  OrganisationRole,
} from 'src/database/interfaces';
import { assertActiveOrg } from 'src/lib/util/active-org';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { S3Service } from 'src/modules/s3/s3.service';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { ResourceEntitlementsRepository } from 'src/repositories/resource-entitlements.repository';
import { SnackCompletionRepository } from 'src/repositories/snack-completion.repository';
import { SnackScheduleRepository } from 'src/repositories/snack-schedule.repository';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';
import { v4 as uuidv4 } from 'uuid';

import {
  CreateContentItemDto,
  ListContentItemsQuery,
  UpdateContentItemDto,
} from './request.dto';
import { formatDateToYMD } from 'src/lib/util';
import {
  ContentItemDTO,
  ContentItemResponse,
  ContentItemsListResponse,
  CreateContentItemResponse,
  SnackScheduleDTO,
} from './response.dto';

/**
 * Format a DATE column value (Date or pg date string) to YYYY-MM-DD.
 * Mirrors the workout-schedule path (formatDateToYMD) so snack
 * schedules and workout schedules bucket onto the same calendar day.
 */
function ymd(value: unknown): string {
  return formatDateToYMD(value instanceof Date ? value : new Date(String(value)));
}

const WRITE_ROLES: OrganisationRole[] = [
  OrganisationRole.OWNER,
  OrganisationRole.ADMIN,
  OrganisationRole.COACH,
];

const VIDEO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
};

// Thumbnails are always JPEG — the client captures via <canvas>.toBlob('image/jpeg').
// Cheap to store, universal browser support, no transparency needed for a poster frame.
const THUMBNAIL_MIME = 'image/jpeg';

@Injectable()
export class ContentItemsApiService {
  constructor(
    private readonly contentRepo: ContentItemRepository,
    private readonly s3Service: S3Service,
    private readonly config: AppConfigService,
    private readonly entitlementsRepo: ResourceEntitlementsRepository,
    private readonly billingRepo: StripeBillingRepository,
    private readonly snackCompletionRepo: SnackCompletionRepository,
    private readonly snackScheduleRepo: SnackScheduleRepository,
  ) {}

  async list(req: AuthedRequest, query: ListContentItemsQuery): Promise<ContentItemsListResponse> {
    const organisationId = assertActiveOrg(req);
    const items = await this.contentRepo.list(
      {
        organisationId,
        kind: query.kind,
        status: query.status,
        tag: query.tag,
      },
      { limit: query.limit, offset: query.offset },
    );
    const locks = await this.computeLockMap(req.user.id, organisationId, items.map((i) => i.id));
    return {
      data: await Promise.all(items.map((i) => this.mapToDTO(i, locks.get(i.id) ?? false))),
    };
  }

  async getById(req: AuthedRequest, id: string): Promise<ContentItemResponse> {
    const organisationId = assertActiveOrg(req);
    const item = await this.contentRepo.findByIdInOrg(id, organisationId);
    if (!item) throw new NotFoundException('Content item not found');
    const locks = await this.computeLockMap(req.user.id, organisationId, [item.id]);
    return { data: await this.mapToDTO(item, locks.get(item.id) ?? false) };
  }

  async create(req: AuthedRequest, dto: CreateContentItemDto): Promise<CreateContentItemResponse> {
    this.requireWriteRole(req);
    const organisationId = assertActiveOrg(req);

    const itemId = uuidv4();
    const filename = dto.videoMimeType
      ? `${uuidv4()}.${VIDEO_EXT[dto.videoMimeType] ?? 'bin'}`
      : null;
    const keys = filename
      ? s3Keys.upload.contentItem({ organisationId, contentItemId: itemId, filename })
      : null;
    const videoKey = keys?.video ?? null;
    // Stage a thumbnail PUT URL too — the client captures a first-frame
    // JPEG via <canvas> and uploads it in parallel with the video. The
    // resulting key is NOT written to the DB row here: only after the
    // object actually lands (verified in markUploadComplete) do we
    // persist it, so rows never reference a phantom thumbnail.
    const thumbnailKey = keys?.thumbnail ?? null;

    const item = await this.contentRepo.create({
      id: itemId,
      organisation_id: organisationId,
      kind: dto.kind,
      title: dto.title,
      description: dto.description ?? null,
      tags: dto.tags ?? [],
      owner_user_id: req.user.id,
      video_s3_bucket: videoKey ? this.s3Service.uploadBucket : null,
      video_s3_key: videoKey,
      video_mime_type: dto.videoMimeType ?? null,
      duration_seconds: dto.durationSeconds ?? null,
      status: videoKey ? ContentItemStatus.UPLOAD_PENDING : ContentItemStatus.DRAFT,
    });

    let uploadUrl: string | null = null;
    let thumbnailUploadUrl: string | null = null;
    if (videoKey && dto.videoMimeType) {
      uploadUrl = await this.s3Service.getSignedUrlPUT({
        bucket: this.s3Service.uploadBucket,
        key: videoKey,
        contentType: dto.videoMimeType,
        expires: 3600,
      });
    }
    if (thumbnailKey) {
      thumbnailUploadUrl = await this.s3Service.getSignedUrlPUT({
        bucket: this.s3Service.uploadBucket,
        key: thumbnailKey,
        contentType: THUMBNAIL_MIME,
        expires: 3600,
      });
    }

    return { data: { ...(await this.mapToDTO(item)), uploadUrl, thumbnailUploadUrl } };
  }

  async update(
    req: AuthedRequest,
    id: string,
    dto: UpdateContentItemDto,
  ): Promise<ContentItemResponse> {
    this.requireWriteRole(req);
    const organisationId = assertActiveOrg(req);
    const existing = await this.contentRepo.findByIdInOrg(id, organisationId);
    if (!existing) throw new NotFoundException('Content item not found');

    const updated = await this.contentRepo.updateById(id, {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.durationSeconds !== undefined ? { duration_seconds: dto.durationSeconds } : {}),
      // ISO strings via the ColumnType's `string | null` INSERT side.
      ...(dto.featuredFrom !== undefined ? { featured_from: dto.featuredFrom } : {}),
      ...(dto.featuredUntil !== undefined ? { featured_until: dto.featuredUntil } : {}),
    });
    return { data: await this.mapToDTO(updated) };
  }

  async markUploadComplete(req: AuthedRequest, id: string): Promise<ContentItemResponse> {
    this.requireWriteRole(req);
    const organisationId = assertActiveOrg(req);
    const existing = await this.contentRepo.findByIdInOrg(id, organisationId);
    if (!existing) throw new NotFoundException('Content item not found');
    if (existing.status !== ContentItemStatus.UPLOAD_PENDING) {
      throw new BadRequestException(`Cannot mark upload complete from status "${existing.status}"`);
    }
    if (!existing.video_s3_bucket || !existing.video_s3_key) {
      throw new BadRequestException('Content item has no upload target configured');
    }
    const exists = await this.s3Service.objectExists({
      bucket: existing.video_s3_bucket,
      key: existing.video_s3_key,
    });
    if (!exists) {
      throw new BadRequestException('No object found at the expected upload location yet');
    }
    // Best-effort thumbnail attach: the create endpoint hands the client
    // a pinned thumbnail upload slot at a deterministic key derived from
    // the video filename. If the client successfully PUT the first-frame
    // JPEG (typical happy path), it'll be sitting there now. If it
    // didn't (older clients, or the canvas capture failed), the row just
    // stays thumbnail-less and the UI shows its placeholder icon. We
    // never block the video on the thumbnail.
    const patch: {
      status: ContentItemStatus;
      thumbnail_s3_bucket?: string;
      thumbnail_s3_key?: string;
      transcode_pending?: boolean;
    } = {
      status: ContentItemStatus.READY,
    };
    const thumbnailKey = this.deriveThumbnailKey(existing.video_s3_key);
    if (thumbnailKey) {
      const thumbnailBucket = existing.video_s3_bucket;
      const thumbnailExists = await this.s3Service.objectExists({
        bucket: thumbnailBucket,
        key: thumbnailKey,
      });
      if (thumbnailExists) {
        patch.thumbnail_s3_bucket = thumbnailBucket;
        patch.thumbnail_s3_key = thumbnailKey;
      }
    }
    // Enqueue the 9:16 portrait companion for snacks when local
    // transcode is on. The cron picks the row up on its next tick and
    // ffmpegs the source into a centre-cropped 720x1280 mp4 alongside
    // the original. We don't queue it for course lessons / exercise
    // intros — those are course-shell or workout-overlay content,
    // played on the org-app surface that's always landscape. Snacks
    // are the surface that lands on phones in portrait.
    if (existing.kind === ContentItemKind.SNACK && this.config.enableLocalTranscode) {
      patch.transcode_pending = true;
    }
    const updated = await this.contentRepo.updateById(id, patch);
    return { data: await this.mapToDTO(updated) };
  }

  /**
   * Mirror of the s3Keys.upload.contentItem({...}).thumbnail naming used at
   * create time: `${dir}/thumbnail-${filename}`. We can't reuse the helper
   * directly here because the input is the full video key, not the parts
   * — but the convention is small and stable, so we recompose it inline.
   */
  private deriveThumbnailKey(videoKey: string): string | null {
    const lastSlash = videoKey.lastIndexOf('/');
    if (lastSlash < 0) return null;
    const dir = videoKey.slice(0, lastSlash);
    const filename = videoKey.slice(lastSlash + 1);
    return `${dir}/thumbnail-${filename}`;
  }

  async delete(req: AuthedRequest, id: string): Promise<void> {
    this.requireWriteRole(req);
    const organisationId = assertActiveOrg(req);
    const existing = await this.contentRepo.findByIdInOrg(id, organisationId);
    if (!existing) throw new NotFoundException('Content item not found');
    await this.contentRepo.deleteById(id);
    if (existing.video_s3_bucket && existing.video_s3_key) {
      try {
        await this.s3Service.deleteObject({
          bucket: existing.video_s3_bucket,
          key: existing.video_s3_key,
        });
      } catch {
        // Best-effort cleanup; row deletion is the source of truth.
      }
    }
  }

  /**
   * Log a completed snack play. Called by the rehabit player when its
   * autoAdvanceOnEnd path fires on a snack track. Verifies the snack
   * lives in the caller's active organisation (we don't want a user
   * logging plays for a snack they couldn't otherwise see) but does
   * NOT enforce a paywall — completion logging is observational, the
   * paywall gates the playback path upstream.
   *
   * Duplicate completions are allowed (re-watching counts). The
   * caller can pass a client-measured `durationSeconds` so the
   * history view can show "you spent 1m 45s in this snack" without
   * defaulting to the snack's intrinsic length.
   */
  async logSnackCompletion(
    req: AuthedRequest,
    id: string,
    durationSeconds?: number,
  ): Promise<void> {
    const organisationId = assertActiveOrg(req);
    const item = await this.contentRepo.findByIdInOrg(id, organisationId);
    if (!item) throw new NotFoundException('Content item not found');
    if (item.kind !== ContentItemKind.SNACK) {
      throw new BadRequestException('Only snack items can have completions logged');
    }
    await this.snackCompletionRepo.create({
      user_id: req.user.id,
      content_item_id: item.id,
      organisation_id: organisationId,
      duration_seconds:
        typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds >= 0
          ? Math.round(durationSeconds)
          : null,
    });
  }

  /**
   * Reverse-chronological list of the caller's completed snack plays,
   * each enriched with the snack's title + thumbnail so the history
   * view can render rows without a second batch lookup. Scoped to the
   * caller via repo; cross-org plays surface naturally (the user IS
   * scoped per-row even though the underlying snacks belong to
   * different orgs over their account lifetime).
   */
  async listMySnackCompletions(
    req: AuthedRequest,
    opts?: { limit?: number },
  ): Promise<{
    data: Array<{
      id: string;
      contentItemId: string;
      title: string;
      thumbnailUrl: string | null;
      completedAt: string;
      durationSeconds: number | null;
    }>;
  }> {
    const completions = await this.snackCompletionRepo.listForUser(req.user.id, opts);
    if (completions.length === 0) return { data: [] };

    // Batch-fetch the referenced snacks via the existing list path so
    // we get the same thumbnail-resolution behaviour as the snacks
    // page. Scoped to the union of orgs that produced these
    // completions — typically just one, but the user may have moved
    // between orgs.
    const uniqueItemIds = Array.from(new Set(completions.map((c) => c.content_item_id)));
    const items = await this.contentRepo.findByIds(uniqueItemIds);
    const itemsById = new Map(items.map((it) => [it.id, it]));

    const data = await Promise.all(
      completions.map(async (c) => {
        const item = itemsById.get(c.content_item_id);
        const title = item?.title ?? 'Snack';
        const thumbnailUrl = item
          ? await this.buildSignedReadUrl(item.thumbnail_s3_bucket, item.thumbnail_s3_key)
          : null;
        return {
          id: c.id,
          contentItemId: c.content_item_id,
          title,
          thumbnailUrl,
          completedAt: new Date(c.completed_at as unknown as string).toISOString(),
          durationSeconds: c.duration_seconds,
        };
      }),
    );
    return { data };
  }

  /**
   * Put a snack on the caller's calendar for a date. Verifies the
   * snack is visible in the caller's active org (same NotFound-on-
   * miss path as getById) and is actually a snack. No paywall check
   * — scheduling is intent, the paywall gates playback when the day
   * arrives. Returns the enriched DTO so the client can drop the new
   * row straight into the calendar cache.
   */
  async scheduleSnack(
    req: AuthedRequest,
    id: string,
    scheduledDate: string,
  ): Promise<{ data: SnackScheduleDTO }> {
    const organisationId = assertActiveOrg(req);
    const item = await this.contentRepo.findByIdInOrg(id, organisationId);
    if (!item) throw new NotFoundException('Content item not found');
    if (item.kind !== ContentItemKind.SNACK) {
      throw new BadRequestException('Only snack items can be scheduled');
    }
    const row = await this.snackScheduleRepo.create({
      user_id: req.user.id,
      content_item_id: item.id,
      organisation_id: organisationId,
      // new Date('YYYY-MM-DD') = UTC midnight — same convention the
      // workout-schedule create path uses, so both land on the same
      // calendar day after formatDateToYMD on the way out.
      scheduled_date: new Date(scheduledDate),
    });
    const thumbnailUrl = await this.buildSignedReadUrl(
      item.thumbnail_s3_bucket,
      item.thumbnail_s3_key,
    );
    return {
      data: {
        id: row.id,
        contentItemId: item.id,
        title: item.title,
        thumbnailUrl,
        scheduledDate: ymd(row.scheduled_date),
        completedAt: row.completed_at
          ? new Date(row.completed_at as unknown as string).toISOString()
          : null,
      },
    };
  }

  /**
   * The caller's scheduled snacks, optionally date-windowed for the
   * calendar. Enriched with title + thumbnail per row.
   */
  async listMySnackSchedules(
    req: AuthedRequest,
    opts?: { dateFrom?: string; dateTo?: string },
  ): Promise<{ data: SnackScheduleDTO[] }> {
    const rows = await this.snackScheduleRepo.listForUser(req.user.id, {
      dateFrom: opts?.dateFrom ? new Date(opts.dateFrom + 'T00:00:00') : undefined,
      dateTo: opts?.dateTo ? new Date(opts.dateTo + 'T00:00:00') : undefined,
    });
    if (rows.length === 0) return { data: [] };

    const uniqueItemIds = Array.from(new Set(rows.map((r) => r.content_item_id)));
    const items = await this.contentRepo.findByIds(uniqueItemIds);
    const itemsById = new Map(items.map((it) => [it.id, it]));

    const data = await Promise.all(
      rows.map(async (r) => {
        const item = itemsById.get(r.content_item_id);
        const thumbnailUrl = item
          ? await this.buildSignedReadUrl(item.thumbnail_s3_bucket, item.thumbnail_s3_key)
          : null;
        return {
          id: r.id,
          contentItemId: r.content_item_id,
          title: item?.title ?? 'Snack',
          thumbnailUrl,
          scheduledDate: ymd(r.scheduled_date),
          completedAt: r.completed_at
            ? new Date(r.completed_at as unknown as string).toISOString()
            : null,
        };
      }),
    );
    return { data };
  }

  private requireWriteRole(req: AuthedRequest): void {
    const role = req.activeOrg?.role;
    if (!role || !WRITE_ROLES.includes(role)) {
      throw new ForbiddenException('You need to be coach, admin or owner to manage content in this organisation');
    }
  }

  /**
   * `locked` defaults to false. Authoring paths (create/update/markUploadComplete)
   * pass nothing — admins managing content don't care about their own
   * entitlements against it. Consumption paths (list/getById) pass the
   * computed lock from computeLockMap so the rehabit / athlete clients
   * can render correct paywall state without a second round-trip.
   */
  async mapToDTO(item: ContentItem, locked = false): Promise<ContentItemDTO> {
    return {
      id: item.id,
      organisationId: item.organisation_id,
      kind: item.kind,
      title: item.title,
      description: item.description,
      ownerUserId: item.owner_user_id,
      videoUrl: await this.buildSignedReadUrl(item.video_s3_bucket, item.video_s3_key),
      // Phone-portrait viewers prefer this one; landscape/desktop
      // viewers fall back to videoUrl. Null until the local-transcode
      // cron (or MediaConvert) produces the 9:16 cut — the client
      // shows the rotate-phone nudge in that interim.
      videoPortraitUrl: await this.buildSignedReadUrl(item.video_portrait_s3_bucket, item.video_portrait_s3_key),
      thumbnailUrl: await this.buildSignedReadUrl(item.thumbnail_s3_bucket, item.thumbnail_s3_key),
      durationSeconds: item.duration_seconds,
      status: item.status,
      tags: item.tags,
      featuredFrom: item.featured_from ? this.toISO(item.featured_from) : null,
      featuredUntil: item.featured_until ? this.toISO(item.featured_until) : null,
      locked,
      createdAt: this.toISO(item.created_at),
      updatedAt: this.toISO(item.updated_at),
    };
  }

  /**
   * Per-user lock-status batch: for every supplied content_item id,
   * decide whether the caller can play it. The rule mirrors
   * `MeApiService.stampLockStatus` so the lock state on a list view
   * matches the lock state on the featured carousel:
   *
   *   • resource has zero configured entitlements → locked = false
   *     (the resource is free; previous client-side logic incorrectly
   *      flagged this case as locked because the user's unlocked set
   *      didn't include it)
   *   • resource has ≥1 entitlement AND user holds an unlocking product
   *     → locked = false
   *   • resource has ≥1 entitlement AND user holds nothing
   *     → locked = true
   *
   * Empty input → empty map (skips both Postgres calls).
   */
  private async computeLockMap(
    userId: string,
    organisationId: string,
    contentItemIds: string[],
  ): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    if (contentItemIds.length === 0) return result;

    const rt: EntitlementResourceType = 'content_item';
    const reqMap = await this.entitlementsRepo.listForResources(rt, contentItemIds);
    const productIds = await this.billingRepo.listActiveProductIdsForUser(userId);
    const unlockedByType = await this.entitlementsRepo.listResourcesByProducts(
      organisationId,
      productIds,
    );
    const userUnlocks = new Set(unlockedByType.get(rt) ?? []);

    for (const id of contentItemIds) {
      const required = reqMap.get(id) ?? [];
      if (required.length === 0) {
        result.set(id, false); // free
        continue;
      }
      result.set(id, !userUnlocks.has(id));
    }
    return result;
  }

  private async buildSignedReadUrl(bucket: string | null, key: string | null): Promise<string | null> {
    if (!bucket || !key) return null;
    return this.s3Service.getSignedUrlGET({ bucket, key, expires: 3600 });
  }

  private toISO(v: unknown): string {
    if (v instanceof Date) return v.toISOString();
    return String(v);
  }
}
