import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { Exercise, ExerciseStatus } from 'src/database/interfaces';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { S3Service } from 'src/modules/s3/s3.service';
import { ExerciseRepository } from 'src/repositories/exercise.repository';

import { transcodeExerciseSource, type WideMode } from './ffmpeg-pipeline';

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
  ) {}

  get enabled(): boolean {
    return this.config.enableLocalTranscode;
  }

  private get wideMode(): WideMode {
    return this.config.localTranscodeWideMode;
  }

  /**
   * Fire-and-forget transcode (ffmpeg takes seconds–minutes, so we don't block
   * the upload-completion request). Sets assets_done on success, assets_failed
   * on error. Local-dev only — if the process restarts mid-transcode, re-run
   * via the reprocess endpoint.
   */
  transcodeInBackground(exercise: Exercise): void {
    void this.transcode(exercise).catch(async (err) => {
      this.logger.error(`Local transcode failed for exercise ${exercise.id}: ${(err as Error).message}`);
      await this.exerciseRepo
        .updateById(exercise.id, { status: ExerciseStatus.ASSETS_FAILED })
        .catch(() => undefined);
    });
  }

  async transcode(exercise: Exercise): Promise<void> {
    if (!exercise.video_s3_bucket || !exercise.video_s3_key) {
      throw new Error('Exercise has no source video to transcode');
    }
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
        media_convert_job_id: null,
        rekognition_job_id: null,
      });
      this.logger.log(
        `Local transcode complete for exercise ${exercise.id} (${artifacts.length} artifacts, wide-mode ${this.wideMode})`,
      );
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}
