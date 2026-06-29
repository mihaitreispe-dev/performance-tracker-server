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
import { ElevenLabsDubbingService } from 'src/modules/elevenlabs/elevenlabs-dubbing.service';
import { extractAudioMp3 } from 'src/modules/local-transcode/ffmpeg-pipeline';
import { S3Service } from 'src/modules/s3/s3.service';

import { buildVttFromText } from './vtt';

/** Where a target's words come from — media to transcribe/dub. */
interface ResolvedSource {
  media?: { bucket: string; key: string; mime: string | null };
  organisationId: string | null;
  /** Media duration if known — paces the generated caption track. */
  durationSeconds?: number | null;
}

@Injectable()
export class TranslationsService {
  private readonly logger = new Logger(TranslationsService.name);

  /**
   * Cap on ElevenLabs dubbing jobs in flight at once — their account has a
   * concurrent-dubbing limit, and an upload fans out to ~7 languages. Excess
   * queued locales wait for a later cron tick (they auto-retry once in-flight
   * jobs finish) rather than bursting the limit and failing.
   */
  private readonly maxConcurrentDubs = 3;

  /**
   * Playback languages an exercise auto-translates into on upload (mirrors
   * the client PLAYER_LANGUAGES). English is a target; Romanian is the
   * source, so it isn't listed.
   */
  private readonly playbackLocales = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl'];

  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly elevenLabsDubbing: ElevenLabsDubbingService,
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
   * Every target's words live in media (a recorded voice-over, the demo
   * video's own audio, or a talking-head intro). We queue one ElevenLabs
   * Dubbing job per locale — Dubbing transcribes, translates AND re-voices
   * (cloning the source speaker) in a single async operation — and the rows
   * sit at `transcribing` until the cron poller finishes them. There is no
   * separate text-translation step, so AWS Translate is not involved.
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

    // Validates the target has media to dub before we queue anything.
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

    await this.queueDubbing({ targetType, targetId, locales });
    return this.listForTarget(targetType, targetId);
  }

  /**
   * Auto-translate a freshly-processed exercise's voice-over into the app's
   * playback languages. Called server-side when the transcode completes, so
   * it never depends on the browser firing the request. Idempotent: skips if
   * the exercise already has translation rows (so it doesn't clobber
   * in-progress dubs or re-dub on every re-transcode). Best-effort — callers
   * ignore failures so a translation hiccup never blocks asset processing.
   */
  async autoTranslateExerciseVoiceover(exerciseId: string): Promise<void> {
    if (!this.elevenLabsDubbing.enabled) return;
    const existing = await this.db
      .selectFrom('content_translations')
      .select('id')
      .where('target_type', '=', 'exercise_voiceover')
      .where('target_id', '=', exerciseId)
      .limit(1)
      .executeTakeFirst();
    if (existing) return; // already requested — leave it alone
    await this.requestTranslations({
      targetType: 'exercise_voiceover',
      targetId: exerciseId,
      locales: this.playbackLocales,
    });
  }

  /** Coach edits a caption → moves to in_review (the dubbed audio is unchanged). */
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
   * Advance a translation's review status. Publishing (re)renders the
   * caption track from the current text and stamps the row so the player
   * can pick it up by locale. The dubbed audio is produced by the Dubbing
   * pipeline, not here, so publishing never re-dubs.
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
    return this.db
      .updateTable('content_translations')
      .set({
        review_status: opts.status,
        reviewed_by: opts.reviewerUserId,
        reviewed_at: sql`now()`,
        ...(publishing ? { published_at: sql`now()` } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', row.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Cron entrypoint (phase 1): create an ElevenLabs Dubbing job for every
   * row queued for dubbing. We resolve + extract the source audio once per
   * target, then fire one job per locale. No-ops when ElevenLabs isn't
   * configured.
   */
  async createPendingDubbingJobs(): Promise<void> {
    if (!this.elevenLabsDubbing.enabled) return;

    // Only start enough new jobs to top up to maxConcurrentDubs; leftover
    // queued rows are picked up on later ticks as in-flight jobs finish.
    const runningRes = await this.db
      .selectFrom('content_translations')
      .select((eb) => eb.fn.countAll().as('c'))
      .where('dub_status', '=', 'running')
      .where('dub_job_id', 'is not', null)
      .executeTakeFirst();
    let slots = this.maxConcurrentDubs - Number(runningRes?.c ?? 0);
    if (slots <= 0) return;

    const targets = await this.db
      .selectFrom('content_translations')
      .select(['target_type', 'target_id'])
      .where('dub_status', '=', 'queued')
      .groupBy(['target_type', 'target_id'])
      .execute();

    for (const t of targets) {
      if (slots <= 0) break;
      try {
        slots -= await this.createDubbingJobsForTarget(t.target_type, t.target_id, slots);
      } catch (e) {
        this.logger.error(`Dubbing create failed for ${t.target_type}/${t.target_id}: ${String(e)}`);
      }
    }
  }

  /**
   * Cron entrypoint (phase 2): poll every in-flight Dubbing job; when one
   * is `dubbed`, download the MP3 (+ transcript caption), store them, and
   * publish the row so the player offers the language. No-ops when
   * ElevenLabs isn't configured.
   */
  async finalizeDubbingJobs(): Promise<void> {
    if (!this.elevenLabsDubbing.enabled) return;

    const running = await this.db
      .selectFrom('content_translations')
      .selectAll()
      .where('dub_status', '=', 'running')
      .where('dub_job_id', 'is not', null)
      .execute();

    for (const row of running) {
      try {
        await this.finalizeDubbingRow(row);
      } catch (e) {
        this.logger.error(`Dubbing finalize failed for ${row.id}: ${String(e)}`);
      }
    }
  }

  private async createDubbingJobsForTarget(
    targetType: TranslationTargetType,
    targetId: string,
    limit: number,
  ): Promise<number> {
    // Claim up to `limit` of this target's queued rows (staying under the
    // dubbing concurrency cap) so a concurrent tick skips them.
    const queuedIds = await this.db
      .selectFrom('content_translations')
      .select('id')
      .where('target_type', '=', targetType)
      .where('target_id', '=', targetId)
      .where('dub_status', '=', 'queued')
      .limit(limit)
      .execute();
    if (queuedIds.length === 0) return 0;

    const claimed = await this.db
      .updateTable('content_translations')
      .set({ dub_provider: 'elevenlabs', dub_status: 'running', updated_at: sql`now()` })
      .where(
        'id',
        'in',
        queuedIds.map((r) => r.id),
      )
      .where('dub_status', '=', 'queued')
      .returningAll()
      .execute();
    if (claimed.length === 0) return 0; // another worker took it

    let audio: Buffer;
    try {
      const source = await this.resolveSource(targetType, targetId);
      if (!source.media) throw new Error('Queued dubbing target has no media.');
      const url = await this.s3Service.getSignedUrlGET({
        bucket: source.media.bucket,
        key: source.media.key,
        expires: 3600,
      });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch source media (status ${res.status}).`);
      const sourceBytes = Buffer.from(await res.arrayBuffer());
      // Extract audio → MP3 once; dubbing audio (not video) guarantees an
      // MP3 dub back, which fits the player's audio-overlay model.
      audio = await extractAudioMp3(sourceBytes);
    } catch (e) {
      // Resolve/fetch/extract failed before any job was created — fail the
      // claimed rows (none have a dub_job_id yet).
      await this.db
        .updateTable('content_translations')
        .set({ dub_status: 'failed', review_status: 'failed', updated_at: sql`now()` })
        .where(
          'id',
          'in',
          claimed.map((r) => r.id),
        )
        .where('dub_job_id', 'is', null)
        .execute();
      throw e;
    }

    let created = 0;
    for (const row of claimed) {
      try {
        const dubbingId = await this.elevenLabsDubbing.createDub({
          audio,
          filename: 'voiceover.mp3',
          sourceLang: row.source_locale,
          targetLang: row.locale,
        });
        await this.db
          .updateTable('content_translations')
          .set({ dub_job_id: dubbingId, updated_at: sql`now()` })
          .where('id', '=', row.id)
          .execute();
        created += 1;
      } catch (e) {
        this.logger.error(`Dubbing create failed for ${row.id} (${row.locale}): ${String(e)}`);
        await this.db
          .updateTable('content_translations')
          .set({ dub_status: 'failed', review_status: 'failed', updated_at: sql`now()` })
          .where('id', '=', row.id)
          .execute();
      }
    }
    return created;
  }

  private async finalizeDubbingRow(row: ContentTranslation): Promise<void> {
    if (!row.dub_job_id) return;

    const { status } = await this.elevenLabsDubbing.getStatus(row.dub_job_id);
    if (status === 'failed') {
      await this.db
        .updateTable('content_translations')
        .set({ dub_status: 'failed', review_status: 'failed', updated_at: sql`now()` })
        .where('id', '=', row.id)
        .execute();
      return;
    }
    if (status !== 'dubbed') return; // still dubbing — pick it up next tick

    const bucket = this.configService.s3ContentBucket;
    const keys = s3Keys.content.translation({
      targetType: row.target_type,
      targetId: row.target_id,
      locale: row.locale,
    });

    const mp3 = await this.elevenLabsDubbing.getDubbedAudio(row.dub_job_id, row.locale);
    await this.s3Service.uploadFile({
      bucket,
      key: keys.dubbedAudio,
      data: mp3,
      additionalParams: { ContentType: 'audio/mpeg' },
    });

    // Best-effort caption: ElevenLabs gives us a timed WebVTT transcript;
    // store it as the caption track and derive plain text for display.
    let caption: { bucket: string; key: string } | null = null;
    let translatedText = row.translated_text ?? '';
    const vtt = await this.elevenLabsDubbing.getTranscriptVtt(row.dub_job_id, row.locale);
    if (vtt) {
      await this.s3Service.uploadFile({
        bucket,
        key: keys.captionVtt,
        data: Buffer.from(vtt, 'utf8'),
        additionalParams: { ContentType: 'text/vtt; charset=utf-8' },
      });
      caption = { bucket, key: keys.captionVtt };
      translatedText = this.plainTextFromVtt(vtt) || translatedText;
    }

    await this.db
      .updateTable('content_translations')
      .set({
        dubbed_audio_s3_bucket: bucket,
        dubbed_audio_s3_key: keys.dubbedAudio,
        dubbed_audio_mime_type: 'audio/mpeg',
        ...(caption ? { caption_vtt_s3_bucket: caption.bucket, caption_vtt_s3_key: caption.key } : {}),
        ...(translatedText ? { translated_text: translatedText } : {}),
        dub_status: 'done',
        review_status: 'published',
        published_at: sql`now()`,
        updated_at: sql`now()`,
      })
      .where('id', '=', row.id)
      .execute();
  }

  // ---- internals ------------------------------------------------------

  /** Queue the locales' rows for the per-minute Dubbing cron to create jobs. */
  private async queueDubbing(opts: {
    targetType: TranslationTargetType;
    targetId: string;
    locales: string[];
  }): Promise<void> {
    if (!this.elevenLabsDubbing.enabled) {
      throw new ServiceUnavailableException(
        'Dubbing is not configured on this server (set ELEVENLABS_API_KEY).',
      );
    }
    await this.db
      .updateTable('content_translations')
      .set({
        dub_provider: 'elevenlabs',
        dub_status: 'queued',
        dub_job_id: null,
        transcribe_status: null,
        transcribe_job_name: null,
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
      // dubbing at the source video (we extract its audio first) so video-audio
      // exercises translate just like a separate recording. A clip with no
      // speech transcribes to empty text → no usable dub.
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
      // Inline intro on the main demo video — dub the source video.
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
    // Course lessons can be long; we still dub the whole clip in Layer 1
    // (time-bounded dubbing is a refinement).
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

  /** Strip WebVTT structure to plain text (for display / the translated_text column). */
  private plainTextFromVtt(vtt: string): string {
    return vtt
      .split(/\r?\n/)
      .filter((line) => {
        const l = line.trim();
        if (!l) return false;
        if (l.startsWith('WEBVTT')) return false;
        if (l.startsWith('NOTE')) return false;
        if (l.includes('-->')) return false; // timestamp line
        if (/^\d+$/.test(l)) return false; // cue index
        return true;
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
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
