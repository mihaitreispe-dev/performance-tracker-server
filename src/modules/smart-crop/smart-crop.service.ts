import {
  GetLabelDetectionCommand,
  type LabelDetection,
  RekognitionClient,
  StartLabelDetectionCommand,
} from '@aws-sdk/client-rekognition';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from 'src/modules/config/app-config.service';

import { computeAspectCrop, type NormalizedBox, type PixelRect, unionBoxes } from './crop-geometry';

const PERSON_LABEL = 'Person';
const MIN_CONFIDENCE = 70;
const PAGE_SIZE = 1000;

export type DetectionStatus = 'in_progress' | 'done' | 'failed';

export interface DetectionCropResult {
  status: DetectionStatus;
  /** Present only when status === 'done' and a person was found. */
  crop: PixelRect | null;
}

/**
 * Smart-crop: ask Rekognition where the person is in a clip, then turn that
 * into a MediaConvert crop rectangle that frames them for a cross-orientation
 * rendition (e.g. 16:9 from a portrait source) instead of letterboxing.
 *
 * Two-phase, non-blocking API so the analysis can be driven durably by a cron
 * (see CronService.syncSmartCropAnalysis) rather than an in-process poll:
 *   1. startDetection() — kick off a Rekognition video label-detection job,
 *      returns its job id (persisted on the exercise row).
 *   2. getDetectionCrop() — a single GetLabelDetection check; when the job has
 *      succeeded, union the Person boxes and compute the crop.
 *
 * Entirely best-effort and flag-gated (ENABLE_SMART_CROP). Failures surface as
 * status 'failed' / null crop so the encoder simply letterboxes.
 */
@Injectable()
export class SmartCropService {
  private readonly logger = new Logger(SmartCropService.name);
  private readonly client: RekognitionClient | null;

  constructor(private readonly config: AppConfigService) {
    this.client = config.enableSmartCrop
      ? new RekognitionClient({
          region: config.mediaConvertRegion,
          credentials: {
            accessKeyId: config.awsAccessKey,
            secretAccessKey: config.awsSecretKey,
          },
        })
      : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /**
   * Start an async Rekognition video label-detection job. Returns the job id
   * to persist, or null when disabled or the start call fails (caller then
   * falls back to a no-crop encode).
   */
  async startDetection(opts: { bucket: string; key: string }): Promise<string | null> {
    if (!this.client) return null;
    try {
      const res = await this.client.send(
        new StartLabelDetectionCommand({
          Video: { S3Object: { Bucket: opts.bucket, Name: opts.key } },
          MinConfidence: MIN_CONFIDENCE,
        }),
      );
      return res.JobId ?? null;
    } catch (err) {
      this.logger.warn(`StartLabelDetection failed for s3://${opts.bucket}/${opts.key}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Check a detection job. Returns 'in_progress' while Rekognition is still
   * working, or a terminal 'done'/'failed' with the computed crop (null when
   * no person was found or anything went wrong). Never throws.
   */
  async getDetectionCrop(opts: { jobId: string; targetAspect: number }): Promise<DetectionCropResult> {
    if (!this.client) return { status: 'failed', crop: null };
    try {
      const first = await this.client.send(new GetLabelDetectionCommand({ JobId: opts.jobId, MaxResults: PAGE_SIZE }));

      if (first.JobStatus === 'IN_PROGRESS') {
        return { status: 'in_progress', crop: null };
      }
      if (first.JobStatus !== 'SUCCEEDED') {
        this.logger.warn(`Label detection job ${opts.jobId} ended with status ${first.JobStatus}`);
        return { status: 'failed', crop: null };
      }

      const personBoxes: NormalizedBox[] = [];
      collectPersonBoxes(first.Labels, personBoxes);
      let nextToken = first.NextToken;
      while (nextToken) {
        const page = await this.client.send(
          new GetLabelDetectionCommand({ JobId: opts.jobId, MaxResults: PAGE_SIZE, NextToken: nextToken }),
        );
        collectPersonBoxes(page.Labels, personBoxes);
        nextToken = page.NextToken;
      }

      const frameWidth = first.VideoMetadata?.FrameWidth;
      const frameHeight = first.VideoMetadata?.FrameHeight;
      if (!frameWidth || !frameHeight || personBoxes.length === 0) {
        this.logger.log(`No person detected in job ${opts.jobId}; falling back to letterbox`);
        return { status: 'done', crop: null };
      }

      const region = unionBoxes(personBoxes);
      if (!region) return { status: 'done', crop: null };

      const crop = computeAspectCrop({ region, frameWidth, frameHeight, targetAspect: opts.targetAspect });
      if (crop) {
        this.logger.log(
          `Smart crop from job ${opts.jobId}: ${crop.width}x${crop.height}+${crop.x}+${crop.y} ` +
            `(source ${frameWidth}x${frameHeight}, ${personBoxes.length} person box(es))`,
        );
      }
      return { status: 'done', crop };
    } catch (err) {
      this.logger.warn(`GetLabelDetection failed for job ${opts.jobId}: ${(err as Error).message}`);
      return { status: 'failed', crop: null };
    }
  }
}

function collectPersonBoxes(labels: LabelDetection[] | undefined, out: NormalizedBox[]): void {
  if (!labels) return;
  for (const detection of labels) {
    if (detection.Label?.Name !== PERSON_LABEL) continue;
    for (const instance of detection.Label.Instances ?? []) {
      const box = instance.BoundingBox;
      if (box && box.Left != null && box.Top != null && box.Width != null && box.Height != null) {
        out.push({ left: box.Left, top: box.Top, width: box.Width, height: box.Height });
      }
    }
  }
}
