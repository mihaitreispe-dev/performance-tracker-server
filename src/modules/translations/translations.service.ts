import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
import { AwsTranslateService } from 'src/modules/aws-translate/aws-translate.service';
import { ElevenLabsSttService } from 'src/modules/elevenlabs/elevenlabs-stt.service';
import { ElevenLabsTtsService } from 'src/modules/elevenlabs/elevenlabs-tts.service';
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

@Injectable()
export class TranslationsService {
  private readonly logger = new Logger(TranslationsService.name);

  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly translate: AwsTranslateService,
    private readonly elevenLabsStt: ElevenLabsSttService,
    private readonly elevenLabsTts: ElevenLabsTtsService,
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
    const sourceLocale = opts.sourceLocale ?? 'ro';
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
      await this.startTranscription({ targetType, targetId, locales });
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
    const publishing = opts.status === 'published';
    if (publishing) {
      if (!row.translated_text?.trim()) {
        throw new BadRequestException('Cannot publish a translation with no text.');
      }
      await this.publishCaption(row);
    }
    // Queue a cloned-voice dub on publish (regenerated on each re-publish
    // so an edited translation gets fresh audio). The cron synthesises it
    // — TTS of a paragraph is too slow to do inline. No-op when ElevenLabs
    // TTS isn't configured.
    const queueDub = publishing && this.elevenLabsTts.enabled;
    return this.db
      .updateTable('content_translations')
      .set({
        review_status: opts.status,
        reviewed_by: opts.reviewerUserId,
        reviewed_at: sql`now()`,
        ...(publishing ? { published_at: sql`now()` } : {}),
        ...(queueDub ? { dub_provider: 'elevenlabs', dub_status: 'queued' as const } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', row.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Cron entrypoint: transcribe + translate every row queued for STT.
   * ElevenLabs Scribe is synchronous, so we run it here (a background
   * worker) — claim a target, transcribe its media once, then
   * machine-translate each waiting locale. No-ops when ElevenLabs isn't
   * configured.
   */
  async advanceTranscriptionJobs(): Promise<void> {
    if (!this.elevenLabsStt.enabled) return;

    const targets = await this.db
      .selectFrom('content_translations')
      .select(['target_type', 'target_id'])
      .where('transcribe_status', '=', 'queued')
      .groupBy(['target_type', 'target_id'])
      .execute();

    for (const t of targets) {
      try {
        await this.runElevenLabsForTarget(t.target_type, t.target_id);
      } catch (e) {
        this.logger.error(`ElevenLabs STT failed for ${t.target_type}/${t.target_id}: ${String(e)}`);
      }
    }
  }

  /**
   * Cron entrypoint: render the cloned-voice dub for every published
   * translation queued for it. Synthesises the approved text with the
   * coach's voice (or the default), uploads the MP3, and stamps
   * `dubbed_audio_s3_*` so the player can play translated narration.
   */
  async advanceDubJobs(): Promise<void> {
    if (!this.elevenLabsTts.enabled) return;

    const queued = await this.db
      .selectFrom('content_translations')
      .selectAll()
      .where('dub_status', '=', 'queued')
      .execute();

    for (const row of queued) {
      try {
        await this.runDubForRow(row);
      } catch (e) {
        this.logger.error(`Dub failed for translation ${row.id}: ${String(e)}`);
      }
    }
  }

  private async runDubForRow(row: ContentTranslation): Promise<void> {
    // Claim so a concurrent tick skips it.
    const claimed = await this.db
      .updateTable('content_translations')
      .set({ dub_status: 'running', updated_at: sql`now()` })
      .where('id', '=', row.id)
      .where('dub_status', '=', 'queued')
      .returningAll()
      .executeTakeFirst();
    if (!claimed) return;

    const text = claimed.translated_text?.trim();
    if (!text) {
      await this.db
        .updateTable('content_translations')
        .set({ dub_status: 'failed', updated_at: sql`now()` })
        .where('id', '=', row.id)
        .execute();
      return;
    }

    try {
      const voiceId = await this.resolveDubVoiceId(claimed.target_type, claimed.target_id);
      if (!voiceId) {
        // No coach voice + no default configured — nothing to dub with.
        await this.db
          .updateTable('content_translations')
          .set({ dub_status: 'failed', updated_at: sql`now()` })
          .where('id', '=', row.id)
          .execute();
        return;
      }
      const mp3 = await this.elevenLabsTts.synthesize(text, voiceId);
      const key = s3Keys.content.translation({
        targetType: claimed.target_type,
        targetId: claimed.target_id,
        locale: claimed.locale,
      }).dubbedAudio;
      const bucket = this.configService.s3ContentBucket;
      await this.s3Service.uploadFile({
        bucket,
        key,
        data: mp3,
        additionalParams: { ContentType: 'audio/mpeg' },
      });
      await this.db
        .updateTable('content_translations')
        .set({
          dubbed_audio_s3_bucket: bucket,
          dubbed_audio_s3_key: key,
          dubbed_audio_mime_type: 'audio/mpeg',
          dub_status: 'done',
          updated_at: sql`now()`,
        })
        .where('id', '=', row.id)
        .execute();
    } catch (e) {
      await this.db
        .updateTable('content_translations')
        .set({ dub_status: 'failed', updated_at: sql`now()` })
        .where('id', '=', row.id)
        .execute();
      throw e;
    }
  }

  /**
   * Pick the voice to dub a target with: the owning coach's enrolled +
   * consented cloned voice, else the configured default. Null when
   * neither is available (the dub is skipped).
   */
  private async resolveDubVoiceId(
    targetType: TranslationTargetType,
    targetId: string,
  ): Promise<string | null> {
    const ownerId =
      targetType === 'content_item'
        ? (
            await this.db
              .selectFrom('content_items')
              .select('owner_user_id')
              .where('id', '=', targetId)
              .executeTakeFirst()
          )?.owner_user_id
        : (
            await this.db
              .selectFrom('exercises')
              .select('user_id')
              .where('id', '=', targetId)
              .executeTakeFirst()
          )?.user_id;

    if (ownerId) {
      const owner = await this.db
        .selectFrom('users')
        .select(['elevenlabs_voice_id', 'voice_clone_consent_at'])
        .where('id', '=', ownerId)
        .executeTakeFirst();
      if (owner?.elevenlabs_voice_id && owner.voice_clone_consent_at) {
        return owner.elevenlabs_voice_id;
      }
    }
    return this.configService.elevenLabsDefaultVoiceId ?? null;
  }

  private async runElevenLabsForTarget(
    targetType: TranslationTargetType,
    targetId: string,
  ): Promise<void> {
    // Claim the target's queued rows so a concurrent tick skips them.
    const claimed = await this.db
      .updateTable('content_translations')
      .set({ transcribe_status: 'running', updated_at: sql`now()` })
      .where('target_type', '=', targetType)
      .where('target_id', '=', targetId)
      .where('transcribe_status', '=', 'queued')
      .returningAll()
      .execute();
    if (claimed.length === 0) return; // another worker took it

    try {
      const source = await this.resolveSource(targetType, targetId);
      if (!source.media) {
        // Authored-text sources are never queued; defensive guard.
        throw new Error('Queued transcription target has no media.');
      }
      const url = await this.s3Service.getSignedUrlGET({
        bucket: source.media.bucket,
        key: source.media.key,
        expires: 3600,
      });
      const sourceLocale = claimed[0].source_locale ?? 'en';
      const { text } = await this.elevenLabsStt.transcribe(url, sourceLocale);
      const trimmed = (text ?? '').trim();

      for (const row of claimed) {
        const translated = trimmed
          ? await this.safeTranslate(trimmed, row.locale, row.source_locale)
          : '';
        await this.db
          .updateTable('content_translations')
          .set({
            source_text: trimmed,
            translated_text: translated,
            transcribe_status: 'done',
            review_status: 'machine_translated',
            updated_at: sql`now()`,
          })
          .where('id', '=', row.id)
          .execute();

        // Exercise voice-overs are fully automatic — no human review gate.
        // Publish the caption + queue the cloned-voice dub immediately so the
        // translated narration is ready for playback without any admin action.
        if (targetType === 'exercise_voiceover' && translated) {
          await this.publishRowAuto({
            ...row,
            source_text: trimmed,
            translated_text: translated,
            review_status: 'machine_translated',
          });
        }
      }
    } catch (e) {
      await this.db
        .updateTable('content_translations')
        .set({ transcribe_status: 'failed', review_status: 'failed', updated_at: sql`now()` })
        .where('target_type', '=', targetType)
        .where('target_id', '=', targetId)
        .where('transcribe_status', '=', 'running')
        .execute();
      throw e;
    }
  }

  // ---- internals ------------------------------------------------------

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
  }): Promise<void> {
    if (!this.elevenLabsStt.enabled) {
      throw new ServiceUnavailableException(
        'Speech-to-text is not configured on this server (set ELEVENLABS_API_KEY).',
      );
    }
    // ElevenLabs Scribe is a synchronous call — queue the rows and let the
    // per-minute cron transcribe + translate so the request returns fast.
    await this.db
      .updateTable('content_translations')
      .set({
        transcribe_status: 'queued',
        review_status: 'transcribing',
        updated_at: sql`now()`,
      })
      .where('target_type', '=', opts.targetType)
      .where('target_id', '=', opts.targetId)
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
          'voiceover_s3_bucket',
          'voiceover_s3_key',
          'voiceover_mime_type',
          'video_s3_bucket',
          'video_s3_key',
          'video_mime_type',
        ])
        .where('id', '=', targetId)
        .executeTakeFirst();
      if (!ex) throw new NotFoundException('Exercise not found.');
      if (ex.voiceover_mode === ExerciseVoiceoverMode.RECORDED) {
        if (!ex.voiceover_s3_bucket || !ex.voiceover_s3_key) {
          throw new BadRequestException('Recorded voice-over has no audio file.');
        }
        return {
          media: { bucket: ex.voiceover_s3_bucket, key: ex.voiceover_s3_key, mime: ex.voiceover_mime_type },
          organisationId: ex.organisation_id,
        };
      }
      // 'off' = the narration lives in the demo video's own audio track. Point
      // STT at the source video directly (ElevenLabs Scribe extracts the audio)
      // so video-audio exercises translate just like a separate recording. A
      // clip with no speech transcribes to empty text → no translation (no-op).
      if (ex.video_s3_bucket && ex.video_s3_key) {
        return {
          media: { bucket: ex.video_s3_bucket, key: ex.video_s3_key, mime: ex.video_mime_type },
          organisationId: ex.organisation_id,
        };
      }
      throw new BadRequestException('Exercise has no audio to translate.');
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

  /**
   * Auto-publish a just-machine-translated row, bypassing the review gate.
   * Used for exercise voice-overs (fully automatic): renders the caption and
   * queues the cloned-voice dub, mirroring setReviewStatus('published') minus
   * the reviewer stamp. The dub cron then produces the translated narration.
   */
  private async publishRowAuto(row: ContentTranslation): Promise<void> {
    if (!row.translated_text?.trim()) return;
    await this.publishCaption(row);
    const queueDub = this.elevenLabsTts.enabled;
    await this.db
      .updateTable('content_translations')
      .set({
        review_status: 'published',
        published_at: sql`now()`,
        ...(queueDub ? { dub_provider: 'elevenlabs', dub_status: 'queued' as const } : {}),
        updated_at: sql`now()`,
      })
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
