import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';

import { ContentTranslation, TranslationTargetType } from 'src/database/interfaces/content-translations-table.interface';
import { Database } from 'src/database/interfaces/database.interface';
import { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';
import { assertActiveOrg } from 'src/lib/util/active-org';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { S3Service } from 'src/modules/s3/s3.service';
import { TranslationsService } from 'src/modules/translations/translations.service';

import { EditTranslationBody, RequestTranslationBody, SetReviewStatusBody } from './request.dto';
import { TranslationDTO, TranslationListResponse, TranslationResponse } from './response.dto';

/**
 * Org-scoped façade over TranslationsService. Every entrypoint asserts
 * the active org and that the target (or row) belongs to it, then maps
 * rows to API DTOs — resolving caption / dubbed-audio S3 keys to signed
 * URLs the same way exercise media is resolved.
 */
@Injectable()
export class TranslationsApiService {
  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly translations: TranslationsService,
    private readonly s3Service: S3Service,
    private readonly configService: AppConfigService,
  ) {}

  async request(req: AuthedRequest, body: RequestTranslationBody): Promise<TranslationListResponse> {
    const orgId = assertActiveOrg(req);
    await this.assertTargetInOrg(body.targetType, body.targetId, orgId);
    const rows = await this.translations.requestTranslations({
      targetType: body.targetType,
      targetId: body.targetId,
      locales: body.locales,
      sourceLocale: body.sourceLocale,
    });
    return this.mapList(rows);
  }

  async list(req: AuthedRequest, targetType: TranslationTargetType, targetId: string): Promise<TranslationListResponse> {
    const orgId = assertActiveOrg(req);
    await this.assertTargetInOrg(targetType, targetId, orgId);
    const rows = await this.translations.listForTarget(targetType, targetId);
    return this.mapList(rows);
  }

  async edit(req: AuthedRequest, id: string, body: EditTranslationBody): Promise<TranslationResponse> {
    await this.loadRowInOrg(req, id);
    const row = await this.translations.editTranslation(id, body.translatedText);
    return new TranslationResponse({ data: await this.mapRow(row) });
  }

  async setStatus(req: AuthedRequest, id: string, body: SetReviewStatusBody): Promise<TranslationResponse> {
    await this.loadRowInOrg(req, id);
    const row = await this.translations.setReviewStatus({
      id,
      status: body.status,
      reviewerUserId: req.user.id,
    });
    return new TranslationResponse({ data: await this.mapRow(row) });
  }

  // ---- org scoping ----------------------------------------------------

  private async assertTargetInOrg(
    targetType: TranslationTargetType,
    targetId: string,
    orgId: string,
  ): Promise<void> {
    const table = targetType === 'content_item' ? 'content_items' : 'exercises';
    const row = await this.db
      .selectFrom(table)
      .select('organisation_id')
      .where('id', '=', targetId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Translation target not found.');
    if (row.organisation_id !== orgId) {
      throw new ForbiddenException('Translation target belongs to another organisation.');
    }
  }

  private async loadRowInOrg(req: AuthedRequest, id: string): Promise<ContentTranslation> {
    const orgId = assertActiveOrg(req);
    const row = await this.translations.findById(id);
    // organisation_id is denormalised onto the row at creation; fall back
    // to re-checking the target if a legacy row lacks it.
    if (row.organisation_id) {
      if (row.organisation_id !== orgId) {
        throw new ForbiddenException('Translation belongs to another organisation.');
      }
    } else {
      await this.assertTargetInOrg(row.target_type, row.target_id, orgId);
    }
    return row;
  }

  // ---- mapping --------------------------------------------------------

  private async mapList(rows: ContentTranslation[]): Promise<TranslationListResponse> {
    const items = await Promise.all(rows.map((r) => this.mapRow(r)));
    return new TranslationListResponse({ data: items });
  }

  /** Resolves the caption / dubbed-audio S3 keys to signed URLs. */
  private async mapRow(row: ContentTranslation): Promise<TranslationDTO> {
    const captionVttUrl = await this.urlFor(row.caption_vtt_s3_bucket, row.caption_vtt_s3_key);
    const dubbedAudioUrl = await this.urlFor(row.dubbed_audio_s3_bucket, row.dubbed_audio_s3_key);
    return { ...this.mapRowSync(row), captionVttUrl, dubbedAudioUrl };
  }

  /** Sync core mapping — list responses resolve URLs lazily below. */
  private mapRowSync(row: ContentTranslation): TranslationDTO {
    return {
      id: row.id,
      targetType: row.target_type,
      targetId: row.target_id,
      locale: row.locale,
      sourceLocale: row.source_locale,
      reviewStatus: row.review_status,
      sourceText: row.source_text,
      translatedText: row.translated_text,
      transcribeStatus: row.transcribe_status,
      dubStatus: row.dub_status,
      captionVttUrl: null,
      dubbedAudioUrl: null,
      reviewedAt: iso(row.reviewed_at),
      publishedAt: iso(row.published_at),
      updatedAt: iso(row.updated_at) ?? '',
    };
  }

  private async urlFor(bucket: string | null, key: string | null): Promise<string | null> {
    if (!bucket || !key) return null;
    if (this.configService.isCloudFrontSigningEnabled && !this.configService.disableCdn) {
      return this.s3Service.getCloudFrontSignedUrlGET({ key });
    }
    return this.s3Service.getSignedUrlGET({ bucket, key });
  }
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
