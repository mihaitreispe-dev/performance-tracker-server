import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';

import { ContentItemKind } from 'src/database/interfaces/content-items-table.interface';
import {
  ContentTranslation,
  TranslationReviewStatus,
  TranslationTargetType,
} from 'src/database/interfaces/content-translations-table.interface';
import { Database } from 'src/database/interfaces/database.interface';
import { ExerciseVoiceoverMode } from 'src/database/interfaces/exercises-table.interface';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { AwsTranscribeService } from 'src/modules/aws-transcribe/aws-transcribe.service';
import { AwsTranslateService } from 'src/modules/aws-translate/aws-translate.service';
import { S3Service } from 'src/modules/s3/s3.service';

import { buildVttFromText } from './vtt';

/** Where a target's words come from. Either known text or media to transcribe. */
interface ResolvedSource {
  text?: string;
  media?: { bucket: string; key: string; mime: string | null };
  organisationId: string | null;
  /** Media duration if known — paces the generated caption track. */
  durationSeconds?: number | null;
}

/**
 * Map a base locale to the regioned language code AWS Transcribe wants
 * (it has no bare 'en'). Falls back to the locale unchanged.
 */
const TRANSCRIBE_LOCALE: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-PT',
  nl: 'nl-NL',
};

@Injectable()
export class TranslationsService {
  private readonly logger = new Logger(TranslationsService.name);

  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly translate: AwsTranslateService,
    private readonly transcribe: AwsTranscribeService,
    private readonly s3Service: S3Service,
    private readonly configService: AppConfigService,
  ) {}

  /** Fetch a single row (org-scoping is done by the caller). */
  async findById(id: string): Promise<ContentTranslation> {
    return this.requireRow(id);
  }

  /** All translation rows for a target, locale-ordered (review panel + player). */
  async listForTarget(
    targetType: TranslationTargetType,
    targetId: string,
  ): Promise<ContentTranslation[]> {
    return this.db
      .selectFrom('content_translations')
      .selectAll()
      .where('target_type', '=', targetType)
      .where('target_id', '=', targetId)
      .orderBy('locale')
      .execute();
  }

  /**
   * Kick off translation of a target into one or more locales.
   *
   * When the source words are already authored (a generated-from-cues
   * voice-over), we translate immediately and land each row at
   * `machine_translated`. When the words live only in audio (a recorded
   * voice-over or a talking-head intro), we fire a single Transcribe job
   * (the transcript is language-independent) and the rows sit at
   * `transcribing` until the cron poller completes them.
   */
  async requestTranslations(opts: {
    targetType: TranslationTargetType;
    targetId: string;
    locales: string[];
    sourceLocale?: string;
  }): Promise<ContentTranslation[]> {
    const { targetType, targetId } = opts;
    const sourceLocale = opts.sourceLocale ?? 'en';
    const locales = [...new Set(opts.locales.map((l) => l.trim()).filter(Boolean))].filter(
      (l) => l !== sourceLocale,
    );
    if (locales.length === 0) {
      throw new BadRequestException('No target locales (after removing the source language).');
    }

    const source = await this.resolveSource(targetType, targetId);

    // Ensure a row exists per locale (idempotent — re-requesting reuses rows).
    for (const locale of locales) {
      await this.upsertRow({
        targetType,
        targetId,
        locale,
        sourceLocale,
        organisationId: source.organisationId,
      });
    }

    if (source.text !== undefined) {
      await this.translateKnownText({ targetType, targetId, locales, sourceLocale, text: source.text });
    } else if (source.media) {
      await this.startTranscription({ targetType, targetId, locales, sourceLocale, media: source.media });
    }

    return this.listForTarget(targetType, targetId);
  }

  /** Coach edits the machine translation → moves to in_review. */
  async editTranslation(id: string, translatedText: string): Promise<ContentTranslation> {
    const row = await this.requireRow(id);
    return this.db
      .updateTable('content_translations')
      .set({
        translated_text: translatedText,
        review_status: 'in_review',
        updated_at: sql`now()`,
      })
      .where('id', '=', row.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Advance a translation's review status. Publishing renders the
   * approved text into a caption track (WebVTT) and stamps the row so
   * the player can pick it up by locale.
   */
  async setReviewStatus(opts: {
    id: string;
    status: Extract<TranslationReviewStatus, 'in_review' | 'approved' | 'published'>;
    reviewerUserId: string;
  }): Promise<ContentTranslation> {
    const row = await this.requireRow(opts.id);
    if (opts.status === 'published') {
      if (!row.translated_text?.trim()) {
        throw new BadRequestException('Cannot publish a translation with no text.');
      }
      await this.publishCaption(row);
    }
    return this.db
      .updateTable('content_translations')
      .set({
        review_status: opts.status,
        reviewed_by: opts.reviewerUserId,
        reviewed_at: sql`now()`,
        ...(opts.status === 'published' ? { published_at: sql`now()` } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', row.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Cron entrypoint: advance every row whose Transcribe job is still in
   * flight. On completion we store the transcript as the source text and
   * machine-translate each waiting locale. Grouped by job name so a
   * shared transcript is fetched once.
   */
  async advanceTranscriptionJobs(): Promise<void> {
    if (!this.transcribe.enabled) return;
    const pending = await this.db
      .selectFrom('content_translations')
      .select(['transcribe_job_name'])
      .where('transcribe_status', 'in', ['queued', 'running'])
      .where('transcribe_job_name', 'is not', null)
      .groupBy('transcribe_job_name')
      .execute();

    for (const { transcribe_job_name: jobName } of pending) {
      if (!jobName) continue;
      try {
        await this.completeTranscriptionJob(jobName);
      } catch (e) {
        this.logger.error(`Transcribe poll failed for ${jobName}: ${String(e)}`);
      }
    }
  }

  // ---- internals ------------------------------------------------------

  private async completeTranscriptionJob(jobName: string): Promise<void> {
    const result = await this.transcribe.getResult(jobName);
    if (result.state === 'queued' || result.state === 'running') return;

    const rows = await this.db
      .selectFrom('content_translations')
      .selectAll()
      .where('transcribe_job_name', '=', jobName)
      .execute();

    if (result.state === 'failed') {
      this.logger.warn(`Transcribe job ${jobName} failed: ${result.failureReason}`);
      await this.db
        .updateTable('content_translations')
        .set({ transcribe_status: 'failed', review_status: 'failed', updated_at: sql`now()` })
        .where('transcribe_job_name', '=', jobName)
        .execute();
      return;
    }

    const text = (result.transcriptText ?? '').trim();
    for (const row of rows) {
      const translated = text ? await this.safeTranslate(text, row.locale, row.source_locale) : '';
      await this.db
        .updateTable('content_translations')
        .set({
          source_text: text,
          translated_text: translated,
          transcribe_status: 'done',
          review_status: 'machine_translated',
          updated_at: sql`now()`,
        })
        .where('id', '=', row.id)
        .execute();
    }
  }

  private async translateKnownText(opts: {
    targetType: TranslationTargetType;
    targetId: string;
    locales: string[];
    sourceLocale: string;
    text: string;
  }): Promise<void> {
    const { targetType, targetId, sourceLocale, text } = opts;
    for (const locale of opts.locales) {
      const translated = await this.safeTranslate(text, locale, sourceLocale);
      await this.db
        .updateTable('content_translations')
        .set({
          source_text: text,
          translated_text: translated,
          review_status: 'machine_translated',
          transcribe_status: null,
          transcribe_job_name: null,
          updated_at: sql`now()`,
        })
        .where('target_type', '=', targetType)
        .where('target_id', '=', targetId)
        .where('locale', '=', locale)
        .execute();
    }
  }

  private async startTranscription(opts: {
    targetType: TranslationTargetType;
    targetId: string;
    locales: string[];
    sourceLocale: string;
    media: { bucket: string; key: string; mime: string | null };
  }): Promise<void> {
    const { targetType, targetId, sourceLocale, media } = opts;
    const jobName = `tr-${targetId}-${Math.random().toString(36).slice(2, 8)}`;
    const mediaLocale = TRANSCRIBE_LOCALE[sourceLocale] ?? sourceLocale;
    await this.transcribe.startTranscription({
      jobName,
      mediaS3Uri: `s3://${media.bucket}/${media.key}`,
      mediaLocale,
      mediaFormat: AwsTranscribeService.mediaFormatForMime(media.mime),
    });
    await this.db
      .updateTable('content_translations')
      .set({
        transcribe_job_name: jobName,
        transcribe_status: 'running',
        review_status: 'transcribing',
        updated_at: sql`now()`,
      })
      .where('target_type', '=', targetType)
      .where('target_id', '=', targetId)
      .where('locale', 'in', opts.locales)
      .execute();
  }

  private async resolveSource(
    targetType: TranslationTargetType,
    targetId: string,
  ): Promise<ResolvedSource> {
    if (targetType === 'exercise_voiceover') {
      const ex = await this.db
        .selectFrom('exercises')
        .select([
          'organisation_id',
          'voiceover_mode',
          'voiceover_script',
          'cues',
          'voiceover_s3_bucket',
          'voiceover_s3_key',
          'voiceover_mime_type',
        ])
        .where('id', '=', targetId)
        .executeTakeFirst();
      if (!ex) throw new NotFoundException('Exercise not found.');
      if (ex.voiceover_mode === ExerciseVoiceoverMode.GENERATED_FROM_CUES) {
        const text = (ex.voiceover_script?.trim() || (ex.cues ?? []).join('. ')).trim();
        if (!text) throw new BadRequestException('Exercise voice-over has no cues or script to translate.');
        return { text, organisationId: ex.organisation_id };
      }
      if (ex.voiceover_mode === ExerciseVoiceoverMode.RECORDED) {
        if (!ex.voiceover_s3_bucket || !ex.voiceover_s3_key) {
          throw new BadRequestException('Recorded voice-over has no audio file.');
        }
        return {
          media: { bucket: ex.voiceover_s3_bucket, key: ex.voiceover_s3_key, mime: ex.voiceover_mime_type },
          organisationId: ex.organisation_id,
        };
      }
      throw new BadRequestException('Exercise has no voice-over to translate (mode is off).');
    }

    if (targetType === 'exercise_intro') {
      const ex = await this.db
        .selectFrom('exercises')
        .select(['organisation_id', 'intro_content_item_id', 'video_s3_bucket', 'video_s3_key', 'video_mime_type'])
        .where('id', '=', targetId)
        .executeTakeFirst();
      if (!ex) throw new NotFoundException('Exercise not found.');
      if (ex.intro_content_item_id) {
        return this.contentItemMedia(ex.intro_content_item_id);
      }
      // Inline intro on the main demo video — transcribe the source video.
      if (!ex.video_s3_bucket || !ex.video_s3_key) {
        throw new BadRequestException('Exercise has no intro media to translate.');
      }
      return {
        media: { bucket: ex.video_s3_bucket, key: ex.video_s3_key, mime: ex.video_mime_type },
        organisationId: ex.organisation_id,
      };
    }

    // content_item (snack / course lesson / standalone exercise intro)
    return this.contentItemMedia(targetId);
  }

  private async contentItemMedia(contentItemId: string): Promise<ResolvedSource> {
    const ci = await this.db
      .selectFrom('content_items')
      .select(['organisation_id', 'kind', 'video_s3_bucket', 'video_s3_key', 'video_mime_type', 'duration_seconds'])
      .where('id', '=', contentItemId)
      .executeTakeFirst();
    if (!ci) throw new NotFoundException('Content item not found.');
    if (!ci.video_s3_bucket || !ci.video_s3_key) {
      throw new BadRequestException('Content item has no video to transcribe.');
    }
    // Course lessons can be long; we still transcribe the whole clip in
    // Layer 1 (time-bounded transcription is a refinement).
    void (ci.kind as ContentItemKind);
    return {
      media: { bucket: ci.video_s3_bucket, key: ci.video_s3_key, mime: ci.video_mime_type },
      organisationId: ci.organisation_id,
      durationSeconds: ci.duration_seconds,
    };
  }

  /** Render approved text → WebVTT, upload to the content bucket, stamp the row. */
  private async publishCaption(row: ContentTranslation): Promise<void> {
    const vtt = buildVttFromText(row.translated_text ?? '', null);
    const key = s3Keys.content.translation({
      targetType: row.target_type,
      targetId: row.target_id,
      locale: row.locale,
    }).captionVtt;
    const bucket = this.configService.s3ContentBucket;
    await this.s3Service.uploadFile({
      bucket,
      key,
      data: Buffer.from(vtt, 'utf8'),
      additionalParams: { ContentType: 'text/vtt; charset=utf-8' },
    });
    await this.db
      .updateTable('content_translations')
      .set({ caption_vtt_s3_bucket: bucket, caption_vtt_s3_key: key, updated_at: sql`now()` })
      .where('id', '=', row.id)
      .execute();
  }

  private async safeTranslate(text: string, targetLocale: string, sourceLocale: string): Promise<string> {
    try {
      return await this.translate.translateText(text, targetLocale, sourceLocale);
    } catch (e) {
      this.logger.error(`Translate ${sourceLocale}->${targetLocale} failed: ${String(e)}`);
      return '';
    }
  }

  private async upsertRow(opts: {
    targetType: TranslationTargetType;
    targetId: string;
    locale: string;
    sourceLocale: string;
    organisationId: string | null;
  }): Promise<void> {
    await this.db
      .insertInto('content_translations')
      .values({
        target_type: opts.targetType,
        target_id: opts.targetId,
        locale: opts.locale,
        source_locale: opts.sourceLocale,
        organisation_id: opts.organisationId,
        review_status: 'pending',
      })
      .onConflict((oc) =>
        oc.constraint('content_translations_unique').doUpdateSet({ updated_at: sql`now()` }),
      )
      .execute();
  }

  private async requireRow(id: string): Promise<ContentTranslation> {
    const row = await this.db
      .selectFrom('content_translations')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Translation not found.');
    return row;
  }
}
