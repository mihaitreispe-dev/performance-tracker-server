import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { assertActiveOrg } from 'src/lib/util/active-org';
import { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { S3Service } from 'src/modules/s3/s3.service';
import { InlineImageRepository } from 'src/repositories/inline-image.repository';
import { v4 as uuidv4 } from 'uuid';

import { RequestInlineImageUploadDto } from './request.dto';
import { RequestInlineImageUploadResponse } from './response.dto';

/**
 * Allowed image mimes for inline embeds. Keep deliberately narrow:
 * jpeg/png cover the org-uploaded asset cases, webp is the modern
 * smaller alternative, gif lets coaches drop the occasional animated
 * cue. SVG is intentionally OFF — the rich-text sanitiser doesn't run
 * on the binary, and SVG can carry script payloads.
 */
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * 1-hour presigned GET URL for the view-endpoint redirect. Short
 * enough to limit replay risk on a leaked URL; long enough that the
 * browser's image cache absorbs the round-trip cost on subsequent
 * views of the same page.
 */
const VIEW_URL_EXPIRES_SECONDS = 3600;

@Injectable()
export class InlineImagesApiService {
  constructor(
    private readonly inlineImageRepo: InlineImageRepository,
    private readonly s3Service: S3Service,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Mint a row + a presigned PUT URL the rich-text editor can stream
   * the image to. Returns a stable view URL the editor embeds in the
   * <img src=...>; that URL is owned by /v1/inline-images/:id/view, so
   * the link in stored HTML doesn't break when the underlying S3
   * signature rotates.
   */
  async requestUpload(
    req: AuthedRequest,
    dto: RequestInlineImageUploadDto,
  ): Promise<RequestInlineImageUploadResponse> {
    const organisationId = assertActiveOrg(req);
    // Tenancy is enforced by the active-org guard upstream; we re-check
    // role here so an athlete-tier member can't drop arbitrary images
    // into a course description.
    const role = req.activeOrg?.role;
    if (role === 'athlete') {
      throw new ForbiddenException('Inline image uploads are restricted to coach/admin/owner');
    }
    if (!ALLOWED_MIMES.has(dto.mimeType)) {
      throw new BadRequestException(`Unsupported image mime-type: ${dto.mimeType}`);
    }
    const id = uuidv4();
    const ext = MIME_EXT[dto.mimeType];
    const key = `inline-images/${organisationId}/${id}.${ext}`;
    const bucket = this.s3Service.uploadBucket;

    const row = await this.inlineImageRepo.create({
      id,
      organisation_id: organisationId,
      owner_user_id: req.user.id,
      bucket,
      key,
      mime_type: dto.mimeType,
      size_bytes: dto.sizeBytes ?? null,
    });

    const uploadUrl = await this.s3Service.getSignedUrlPUT({
      bucket,
      key,
      contentType: dto.mimeType,
      expires: 3600,
    });
    return {
      data: {
        id: row.id,
        uploadUrl,
        viewUrl: this.buildViewUrl(row.id),
        bucket,
        key,
      },
    };
  }

  /**
   * Resolve a stable view URL to a fresh signed S3 GET URL. The
   * controller calls this and 302-redirects. No auth — anyone with
   * the inline-image id can fetch (URL-as-capability, same model as
   * a public CDN).
   */
  async resolveViewUrl(id: string): Promise<string> {
    const row = await this.inlineImageRepo.findById(id);
    if (!row) throw new NotFoundException('Inline image not found');
    const signed = await this.s3Service.getSignedUrlGET({
      bucket: row.bucket,
      key: row.key,
      expires: VIEW_URL_EXPIRES_SECONDS,
    });
    if (!signed) throw new NotFoundException('Inline image not retrievable');
    return signed;
  }

  /**
   * Assemble the stable client-facing URL for a stored image. Lives
   * here (vs. in the controller) so the service can hand the same
   * format back from requestUpload without round-tripping through
   * a controller helper. apiV1URL is the host root (no path); we tack
   * on `/v1/inline-images/...` ourselves so this stays correct even if
   * the env value ever picks up a trailing slash by accident.
   */
  private buildViewUrl(id: string): string {
    const base = this.config.apiV1URL.replace(/\/+$/, '');
    return `${base}/v1/inline-images/${id}/view`;
  }
}
