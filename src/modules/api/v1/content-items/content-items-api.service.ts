import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentItem, ContentItemStatus, OrganisationRole } from 'src/database/interfaces';
import { assertActiveOrg } from 'src/lib/util/active-org';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';
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

@Injectable()
export class ContentItemsApiService {
  constructor(
    private readonly contentRepo: ContentItemRepository,
    private readonly s3Service: S3Service,
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
    const videoKey = filename
      ? s3Keys.upload.contentItem({ organisationId, contentItemId: itemId, filename }).video
      : null;

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
    if (videoKey && dto.videoMimeType) {
      uploadUrl = await this.s3Service.getSignedUrlPUT({
        bucket: this.s3Service.uploadBucket,
        key: videoKey,
        contentType: dto.videoMimeType,
        expires: 3600,
      });
    }

    return { data: { ...(await this.mapToDTO(item)), uploadUrl } };
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
    const updated = await this.contentRepo.updateById(id, { status: ContentItemStatus.READY });
    return { data: await this.mapToDTO(updated) };
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
