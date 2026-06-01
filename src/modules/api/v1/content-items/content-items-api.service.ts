import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentItem, ContentItemKind, ContentItemStatus, OrganisationRole } from 'src/database/interfaces';
import { assertActiveOrg } from 'src/lib/util/active-org';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { S3Service } from 'src/modules/s3/s3.service';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { v4 as uuidv4 } from 'uuid';

import {
  CreateContentItemDto,
  ListContentItemsQuery,
  UpdateContentItemDto,
} from './request.dto';
import {
  ContentItemDTO,
  ContentItemResponse,
  ContentItemsListResponse,
  CreateContentItemResponse,
} from './response.dto';

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
    return { data: await Promise.all(items.map((i) => this.mapToDTO(i))) };
  }

  async getById(req: AuthedRequest, id: string): Promise<ContentItemResponse> {
    const organisationId = assertActiveOrg(req);
    const item = await this.contentRepo.findByIdInOrg(id, organisationId);
    if (!item) throw new NotFoundException('Content item not found');
    return { data: await this.mapToDTO(item) };
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

  private requireWriteRole(req: AuthedRequest): void {
    const role = req.activeOrg?.role;
    if (!role || !WRITE_ROLES.includes(role)) {
      throw new ForbiddenException('You need to be coach, admin or owner to manage content in this organisation');
    }
  }

  async mapToDTO(item: ContentItem): Promise<ContentItemDTO> {
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
      createdAt: this.toISO(item.created_at),
      updatedAt: this.toISO(item.updated_at),
    };
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
