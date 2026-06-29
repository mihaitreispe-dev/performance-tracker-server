import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { ContentItem, Exercise, ExerciseStatus } from 'src/database/interfaces';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { S3Service } from 'src/modules/s3/s3.service';
import { TranslationsService } from 'src/modules/translations/translations.service';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';

import { transcodeExerciseSource, transcodeSnackPortrait, type WideMode } from './ffmpeg-pipeline';

/**
 * Local-dev stand-in for MediaConvert. When ENABLE_LOCAL_TRANSCODE is set the
 * exercises pipeline calls this instead of submitting a MediaConvert job:
 * ffmpeg transcodes the uploaded source into the same dual-aspect artifact set
 * and uploads it to the content bucket at the exact keys buildMediaAssets
 * reads, then flips the row to assets_done. Same observable outcome as the AWS
 * path, no AWS.
 *
 * Requires ffmpeg on PATH and a reachable object store (MinIO) with a
 * public-read content bucket. Detection-based smart crop has no local
 * equivalent — LOCAL_TRANSCODE_WIDE_MODE picks letterbox vs centre-crop.
 */
@Injectable()
export class LocalTranscodeService {
  private readonly logger = new Logger(LocalTranscodeService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly s3Service: S3Service,
    private readonly exerciseRepo: ExerciseRepository,
    private readonly contentItemRepo: ContentItemRepository,
    private readonly translations: TranslationsService,
  ) {}

  get enabled(): boolean {
    return this.config.enableLocalTranscode;
  }

  private get wideMode(): WideMode {
    return this.config.localTranscodeWideMode;
  }

  /**
   * Claim a queued exercise and transcode it to completion. Called by the
   * cron — startAssetProcessing only sets `local_transcode_pending=true` and
   * returns; this method does the actual work. Durable because the claim
   * (`local_transcode_started_at`) and the pending flag live on the row, so
   * a process restart mid-transcode is picked back up by the next cron tick
   * after the claim timeout.
   *
   * Success: clears the pending flag + claim, sets ASSETS_DONE.
   * Failure: clears the pending flag + claim, sets ASSETS_FAILED (caller in
   * the cron rethrows after logging if it wants per-tick visibility).
   */
  async transcode(exercise: Exercise): Promise<void> {
    if (!exercise.video_s3_bucket || !exercise.video_s3_key) {
      throw new Error('Exercise has no source video to transcode');
    }
    // Stamp the claim so concurrent cron ticks skip this row.
    await this.exerciseRepo.updateById(exercise.id, { local_transcode_started_at: new Date() });

    const workDir = join(tmpdir(), `local-xcode-${exercise.id}-${Date.now()}`);
    await mkdir(workDir, { recursive: true });
    try {
      const sourcePath = await this.s3Service.downloadObject({
        bucket: exercise.video_s3_bucket,
        key: exercise.video_s3_key,
        downloadsDir: workDir,
        filename: 'source',
      });

      const artifacts = await transcodeExerciseSource({ sourcePath, workDir, wideMode: this.wideMode });

      const paths = s3Keys.content.exercise({ userId: exercise.user_id, exerciseId: exercise.id });
      for (const artifact of artifacts) {
        const data = await readFile(artifact.localPath);
        await this.s3Service.uploadFile({
          bucket: this.config.s3ContentBucket,
          key: `${paths.base}/${artifact.relKey}`,
          data,
          additionalParams: { ContentType: artifact.contentType },
        });
      }

      await this.exerciseRepo.updateById(exercise.id, {
        status: ExerciseStatus.ASSETS_DONE,
        local_transcode_pending: false,
        local_transcode_started_at: null,
        media_convert_job_id: null,
        rekognition_job_id: null,
      });
      this.logger.log(
        `Local transcode complete for exercise ${exercise.id} (${artifacts.length} artifacts, wide-mode ${this.wideMode})`,
      );

      // The audio is now ready — kick off voice-over translation server-side
      // so it doesn't depend on the browser firing the request. Best-effort:
      // a translation hiccup must never fail the (already-done) transcode.
      try {
        await this.translations.autoTranslateExerciseVoiceover(exercise.id);
      } catch (e) {
        this.logger.warn(`Auto-translate request failed for exercise ${exercise.id}: ${String(e)}`);
      }
    } catch (err) {
      await this.exerciseRepo
        .updateById(exercise.id, {
          status: ExerciseStatus.ASSETS_FAILED,
          local_transcode_pending: false,
          local_transcode_started_at: null,
        })
        .catch(() => undefined);
      throw err;
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  /**
   * Produce the 9:16 portrait companion for a snack. Unlike exercises
   * (full dual-aspect HLS rendering), snacks ship as plain mp4 over
   * Range — we only need a single centre-cropped 720x1280 file landed
   * alongside the original source. The row's status stays READY the
   * whole time; the portrait cut is purely an enhancement (phone-
   * portrait viewers get it, everyone else keeps using `video_s3_*`).
   *
   * Mirrors the durable-claim shape of `transcode()` for exercises.
   * Stamps the claim, runs ffmpeg, uploads to the upload bucket under
   * a deterministic ".portrait.mp4" suffix on the source key, writes
   * the new columns + clears the pending flag. On failure the pending
   * flag clears too — we don't retry forever, the rotate-nudge UX
   * gracefully covers the missing variant.
   */
  async transcodeSnack(item: ContentItem): Promise<void> {
    if (!item.video_s3_bucket || !item.video_s3_key) {
      throw new Error('Snack has no source video to transcode');
    }
    await this.contentItemRepo.updateById(item.id, { transcode_started_at: new Date() });

    const workDir = join(tmpdir(), `local-snack-xcode-${item.id}-${Date.now()}`);
    await mkdir(workDir, { recursive: true });
    try {
      const sourcePath = await this.s3Service.downloadObject({
        bucket: item.video_s3_bucket,
        key: item.video_s3_key,
        downloadsDir: workDir,
        filename: 'source.mp4',
      });
      const portraitPath = join(workDir, 'portrait.mp4');
      await transcodeSnackPortrait({ sourcePath, outPath: portraitPath });

      // Land the portrait cut next to the source under a deterministic
      // suffix so the key is reconstructible from the source key alone
      // — no extra column to remember the suffix.
      const portraitKey = derivePortraitKey(item.video_s3_key);
      const data = await readFile(portraitPath);
      await this.s3Service.uploadFile({
        bucket: item.video_s3_bucket,
        key: portraitKey,
        data,
        additionalParams: { ContentType: 'video/mp4' },
      });

      await this.contentItemRepo.updateById(item.id, {
        video_portrait_s3_bucket: item.video_s3_bucket,
        video_portrait_s3_key: portraitKey,
        transcode_pending: false,
        transcode_started_at: null,
      });
      this.logger.log(`Snack portrait transcode complete for content_item ${item.id}`);
    } catch (err) {
      await this.contentItemRepo
        .updateById(item.id, { transcode_pending: false, transcode_started_at: null })
        .catch(() => undefined);
      throw err;
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}

/**
 * Map a source key like `foo/bar/baz.mp4` to its portrait companion
 * `foo/bar/baz.portrait.mp4`. Single-source-of-truth so the API DTO
 * mapper (which signs the URL) and the worker (which uploads the
 * file) agree on where the asset lives — though in practice both read
 * `video_portrait_s3_key` from the DB, so this is only the worker's
 * write target.
 */
function derivePortraitKey(sourceKey: string): string {
  const lastDot = sourceKey.lastIndexOf('.');
  if (lastDot < 0) return `${sourceKey}.portrait.mp4`;
  return `${sourceKey.slice(0, lastDot)}.portrait.mp4`;
}
