import {
  GetTranscriptionJobCommand,
  StartTranscriptionJobCommand,
  TranscribeClient,
  type LanguageCode,
  type MediaFormat,
  type SubtitleFormat,
  type TranscribeClientConfig,
} from '@aws-sdk/client-transcribe';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { S3Service } from 'src/modules/s3/s3.service';

export type TranscribeJobState = 'queued' | 'running' | 'done' | 'failed';

export interface TranscribeResult {
  state: TranscribeJobState;
  /** Plain transcript text — present when state is 'done'. */
  transcriptText?: string;
  /** Content-bucket key of the source-language WebVTT — present when done. */
  subtitleVttKey?: string;
  failureReason?: string;
}

/** Where transcript JSON + the source-language VTT land in the content bucket. */
const TRANSCRIBE_PREFIX = 'translations/_transcribe';

/**
 * Thin wrapper around AWS Transcribe for the content-translation
 * pipeline — speech-to-text for recorded voice-overs and talking-head
 * intros that have no authored script.
 *
 * Off by default (`enableAwsTranscribe`). Jobs are durable: the caller
 * stores the job name on the content_translations row and the cron
 * poller advances it, mirroring the MediaConvert / Rekognition pattern.
 * Transcribe writes both the transcript JSON and a WebVTT subtitle file
 * (source language) into the content bucket; the VTT becomes the
 * caption track and the JSON yields the text we translate.
 */
@Injectable()
export class AwsTranscribeService {
  private readonly logger = new Logger(AwsTranscribeService.name);
  private readonly client: TranscribeClient;
  private readonly outputBucket: string;

  constructor(
    private readonly configService: AppConfigService,
    private readonly s3Service: S3Service,
  ) {
    const explicitKey = this.configService.awsAccessKey;
    const opts: TranscribeClientConfig = {
      ...(explicitKey
        ? {
            credentials: {
              accessKeyId: explicitKey,
              secretAccessKey: this.configService.awsSecretKey,
            },
          }
        : {}),
      region: this.configService.s3Region,
    };
    this.client = new TranscribeClient(opts);
    this.outputBucket = this.configService.s3ContentBucket;
  }

  get enabled(): boolean {
    return this.configService.enableAwsTranscribe;
  }

  private transcriptKey(jobName: string): string {
    return `${TRANSCRIBE_PREFIX}/${jobName}.json`;
  }

  /** Transcribe names the subtitle file off the OutputKey base. */
  subtitleKey(jobName: string): string {
    return `${TRANSCRIBE_PREFIX}/${jobName}.vtt`;
  }

  /**
   * Start a transcription job over an S3 media object (audio or video).
   * `mediaS3Uri` is an `s3://bucket/key` URI. `mediaLocale` is a
   * Transcribe language code (e.g. 'en-US'). Job names must be globally
   * unique within the account/region, so callers derive them from the
   * row id + a salt.
   */
  async startTranscription(opts: {
    jobName: string;
    mediaS3Uri: string;
    mediaLocale: string;
    mediaFormat?: string;
  }): Promise<void> {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'AWS Transcribe is not enabled on this server (set ENABLE_AWS_TRANSCRIBE=Y).',
      );
    }
    const { jobName, mediaS3Uri, mediaLocale, mediaFormat } = opts;
    await this.client.send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        LanguageCode: mediaLocale as LanguageCode,
        Media: { MediaFileUri: mediaS3Uri },
        ...(mediaFormat ? { MediaFormat: mediaFormat as MediaFormat } : {}),
        OutputBucketName: this.outputBucket,
        OutputKey: this.transcriptKey(jobName),
        Subtitles: { Formats: ['vtt'] as SubtitleFormat[] },
      }),
    );
  }

  /**
   * Poll a job. When complete, reads the transcript JSON from the
   * content bucket and returns the flattened text plus the VTT key.
   */
  async getResult(jobName: string): Promise<TranscribeResult> {
    if (!this.enabled) {
      throw new ServiceUnavailableException('AWS Transcribe is not enabled on this server.');
    }
    const res = await this.client.send(
      new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }),
    );
    const status = res.TranscriptionJob?.TranscriptionJobStatus;
    if (status === 'COMPLETED') {
      const transcriptText = await this.readTranscriptText(jobName);
      return { state: 'done', transcriptText, subtitleVttKey: this.subtitleKey(jobName) };
    }
    if (status === 'FAILED') {
      return { state: 'failed', failureReason: res.TranscriptionJob?.FailureReason ?? 'unknown' };
    }
    if (status === 'QUEUED') return { state: 'queued' };
    return { state: 'running' };
  }

  /** Map a media MIME type to the Transcribe MediaFormat, when known. */
  static mediaFormatForMime(mime: string | null | undefined): string | undefined {
    switch (mime) {
      case 'audio/mpeg':
        return 'mp3';
      case 'audio/mp4':
      case 'video/mp4':
        return 'mp4';
      case 'audio/wav':
      case 'audio/x-wav':
        return 'wav';
      case 'audio/webm':
      case 'video/webm':
        return 'webm';
      case 'audio/ogg':
        return 'ogg';
      default:
        return undefined; // let Transcribe sniff it
    }
  }

  private async readTranscriptText(jobName: string): Promise<string> {
    const buf = await this.s3Service.getObject({
      bucket: this.outputBucket,
      key: this.transcriptKey(jobName),
    });
    try {
      const json = JSON.parse(buf.toString('utf8')) as {
        results?: { transcripts?: { transcript?: string }[] };
      };
      return (
        json.results?.transcripts
          ?.map((t) => t.transcript ?? '')
          .join(' ')
          .trim() ?? ''
      );
    } catch (e) {
      this.logger.error(`Failed to parse transcript JSON for ${jobName}: ${String(e)}`);
      return '';
    }
  }
}
