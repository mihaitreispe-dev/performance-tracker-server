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
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // ~5 minutes
const MIN_CONFIDENCE = 70;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface DetectionResult {
  frameWidth?: number;
  frameHeight?: number;
  personBoxes: NormalizedBox[];
}

/**
 * Smart-crop spike: ask Rekognition where the person is in a clip, then turn
 * that into a MediaConvert crop rectangle that frames them for a
 * cross-orientation rendition (e.g. 16:9 from a portrait source) instead of
 * letterboxing.
 *
 * Entirely best-effort and flag-gated (ENABLE_SMART_CROP). Every failure
 * path returns null so the encoder simply falls back to aspect-preserving
 * fit. Rekognition video label detection is async; we start a job and poll
 * GetLabelDetection (no SNS channel needed). Person bounding boxes are
 * unioned across the sampled frames and VideoMetadata gives the source
 * pixel dimensions the crop rectangle needs.
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
   * Returns a crop rect (source pixels) that frames the person for
   * `targetAspect`, or null when disabled, no person is found, or anything
   * goes wrong. Never throws — the caller treats null as "no crop".
   */
  async detectPersonCrop(opts: { bucket: string; key: string; targetAspect: number }): Promise<PixelRect | null> {
    if (!this.client) return null;
    try {
      const start = await this.client.send(
        new StartLabelDetectionCommand({
          Video: { S3Object: { Bucket: opts.bucket, Name: opts.key } },
          MinConfidence: MIN_CONFIDENCE,
        }),
      );
      if (!start.JobId) {
        this.logger.warn('StartLabelDetection returned no JobId; skipping smart crop');
        return null;
      }

      const detection = await this.pollLabelDetection(start.JobId);
      if (!detection || !detection.frameWidth || !detection.frameHeight) {
        return null;
      }
      if (detection.personBoxes.length === 0) {
        this.logger.log(`No person detected for s3://${opts.bucket}/${opts.key}; falling back to letterbox`);
        return null;
      }

      const region = unionBoxes(detection.personBoxes);
      if (!region) return null;

      const crop = computeAspectCrop({
        region,
        frameWidth: detection.frameWidth,
        frameHeight: detection.frameHeight,
        targetAspect: opts.targetAspect,
      });
      if (crop) {
        this.logger.log(
          `Smart crop for s3://${opts.bucket}/${opts.key}: ${crop.width}x${crop.height}+${crop.x}+${crop.y} ` +
            `(source ${detection.frameWidth}x${detection.frameHeight}, ${detection.personBoxes.length} person box(es))`,
        );
      }
      return crop;
    } catch (err) {
      this.logger.warn(`Smart-crop detection failed; falling back to letterbox: ${(err as Error).message}`);
      return null;
    }
  }

  private async pollLabelDetection(jobId: string): Promise<DetectionResult | null> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      const page = await this.client!.send(new GetLabelDetectionCommand({ JobId: jobId, MaxResults: 1000 }));

      if (page.JobStatus === 'IN_PROGRESS') {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      if (page.JobStatus !== 'SUCCEEDED') {
        this.logger.warn(`Label detection job ${jobId} ended with status ${page.JobStatus}`);
        return null;
      }

      const personBoxes: NormalizedBox[] = [];
      collectPersonBoxes(page.Labels, personBoxes);

      let nextToken = page.NextToken;
      while (nextToken) {
        const next = await this.client!.send(
          new GetLabelDetectionCommand({ JobId: jobId, MaxResults: 1000, NextToken: nextToken }),
        );
        collectPersonBoxes(next.Labels, personBoxes);
        nextToken = next.NextToken;
      }

      return {
        frameWidth: page.VideoMetadata?.FrameWidth,
        frameHeight: page.VideoMetadata?.FrameHeight,
        personBoxes,
      };
    }
    this.logger.warn(`Label detection job ${jobId} timed out after ${MAX_POLL_ATTEMPTS} polls`);
    return null;
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
