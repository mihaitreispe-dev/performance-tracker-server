import {
  CancelJobCommand,
  CancelJobCommandInput,
  CreateJobCommand,
  CreateJobCommandInput,
  GetJobCommand,
  GetJobCommandInput,
  MediaConvert,
  MediaConvertClientConfig,
  type AudioDescription,
  type Output,
  type OutputGroup,
  type Rectangle,
} from '@aws-sdk/client-mediaconvert';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from 'src/modules/config/app-config.service';

/**
 * One HLS variant (ladder rung). Width/Height define the *output frame*;
 * MediaConvert preserves the source aspect ratio and pillar/letter-boxes
 * to fit, so a portrait source rendered into a 16:9 frame keeps the whole
 * body in view (with side bars) rather than cropping it. Smart body-aware
 * crop is a follow-up that pre-crops the input via VideoSelector.Crop.
 */
interface VideoRung {
  width: number;
  height: number;
  maxBitrate: number;
  nameModifier: string;
}

const PORTRAIT_RUNGS: VideoRung[] = [
  { width: 720, height: 1280, maxBitrate: 5242880, nameModifier: '_720p' },
  { width: 480, height: 854, maxBitrate: 2621440, nameModifier: '_480p' },
  { width: 360, height: 640, maxBitrate: 1048576, nameModifier: '_360p' },
];

const WIDE_RUNGS: VideoRung[] = [
  { width: 1280, height: 720, maxBitrate: 5242880, nameModifier: '_720p' },
  { width: 854, height: 480, maxBitrate: 2621440, nameModifier: '_480p' },
  { width: 640, height: 360, maxBitrate: 1048576, nameModifier: '_360p' },
];

@Injectable()
export class MediaConvertService {
  private readonly logger = new Logger(MediaConvertService.name);
  public readonly region: string;
  private readonly mediaConvertClient: MediaConvert;
  private readonly mediaConvertRole: string;
  private readonly mediaConvertQueue: string;

  constructor(private readonly configService: AppConfigService) {
    this.region = this.configService.mediaConvertRegion;
    const mediaConvertOpts: MediaConvertClientConfig = {
      credentials: {
        accessKeyId: this.configService.awsAccessKey,
        secretAccessKey: this.configService.awsSecretKey,
      },
      region: this.region,
    };
    this.mediaConvertClient = new MediaConvert(mediaConvertOpts);
    this.mediaConvertRole = this.configService.mediaConvertRole;
    this.mediaConvertQueue = this.configService.mediaConvertQueue;
  }

  /** Stereo AAC track shared by every HLS rung + the standalone audio file. */
  private aacAudioDescriptions(): AudioDescription[] {
    return [
      {
        AudioSourceName: 'Audio Selector 1',
        CodecSettings: {
          Codec: 'AAC',
          AacSettings: {
            Bitrate: 320000,
            CodingMode: 'CODING_MODE_2_0',
            SampleRate: 48000,
          },
        },
      },
    ];
  }

  private hlsVideoOutput(rung: VideoRung, crop?: Rectangle): Output {
    return {
      ContainerSettings: {
        Container: 'M3U8',
        M3u8Settings: {},
      },
      VideoDescription: {
        Width: rung.width,
        Height: rung.height,
        // Per-output crop frames the person for cross-orientation renditions
        // (smart crop). Absent → MediaConvert preserves source aspect and
        // pill/letterboxes to fit.
        ...(crop ? { Crop: crop } : {}),
        CodecSettings: {
          Codec: 'H_264',
          H264Settings: {
            MaxBitrate: rung.maxBitrate,
            RateControlMode: 'QVBR',
            SceneChangeDetect: 'TRANSITION_DETECTION',
          },
        },
      },
      AudioDescriptions: this.aacAudioDescriptions(),
      OutputSettings: {
        HlsSettings: {},
      },
      NameModifier: rung.nameModifier,
    };
  }

  /** An HLS variant ladder writing its master + variants to `destination`. */
  private hlsGroup(customName: string, destination: string, rungs: VideoRung[], crop?: Rectangle): OutputGroup {
    return {
      CustomName: customName,
      Name: 'Apple HLS',
      Outputs: rungs.map((rung) => this.hlsVideoOutput(rung, crop)),
      OutputGroupSettings: {
        Type: 'HLS_GROUP_SETTINGS',
        HlsGroupSettings: {
          SegmentLength: 10,
          Destination: destination,
          MinSegmentLength: 0,
        },
      },
    };
  }

  /** A standalone AAC-in-MP4 audio file ({base}/video_audio.mp4). */
  private audioGroup(destination: string): OutputGroup {
    return {
      CustomName: 'audio',
      Name: 'File Group',
      Outputs: [
        {
          ContainerSettings: {
            Container: 'MP4',
            Mp4Settings: {},
          },
          AudioDescriptions: this.aacAudioDescriptions(),
          NameModifier: '_audio',
        },
      ],
      OutputGroupSettings: {
        Type: 'FILE_GROUP_SETTINGS',
        FileGroupSettings: {
          Destination: destination,
        },
      },
    };
  }

  /** A FRAME_CAPTURE still (poster / thumbnail) at the given output frame. */
  private frameCaptureGroup(
    customName: string,
    destination: string,
    width: number,
    height: number,
    nameModifier: string,
    crop?: Rectangle,
  ): OutputGroup {
    return {
      CustomName: customName,
      Name: 'File Group',
      Outputs: [
        {
          ContainerSettings: {
            Container: 'RAW',
          },
          VideoDescription: {
            Width: width,
            Height: height,
            // Match the video crop so the still frames the person identically.
            ...(crop ? { Crop: crop } : {}),
            CodecSettings: {
              Codec: 'FRAME_CAPTURE',
              FrameCaptureSettings: {
                FramerateNumerator: 30,
                FramerateDenominator: 42,
                MaxCaptures: 2,
                Quality: 80,
              },
            },
          },
          Extension: 'jpg',
          NameModifier: nameModifier,
        },
      ],
      OutputGroupSettings: {
        Type: 'FILE_GROUP_SETTINGS',
        FileGroupSettings: {
          Destination: destination,
        },
      },
    };
  }

  /**
   * Subtitles-only HLS output (WEBVTT). Adds a SUBTITLES group entry
   * to the master playlist so hls.js and Safari pick the track up
   * automatically — the player chrome only renders the CC toggle when
   * the manifest carries one of these.
   *
   * Wired conditionally in `createJob` based on `captionInputUrl`. We
   * default to English; a future multi-language slice extends this to
   * an array of (languageCode, sourceFile) pairs.
   *
   * TODO(captions): we need an authoring workflow that lets an org
   * upload a .vtt sidecar alongside the master video. The player end
   * is ready — the missing piece is the upload UI + the
   * `captionInputUrl` plumb-through from the asset-create endpoint
   * down to this service. Until that lands, no exercise / class /
   * snack ships with captions and the CC toggle stays hidden.
   */
  private subtitlesHlsOutput(): Output {
    return {
      ContainerSettings: {
        Container: 'M3U8',
      },
      CaptionDescriptions: [
        {
          CaptionSelectorName: 'Captions Selector 1',
          DestinationSettings: {
            DestinationType: 'WEBVTT',
            WebvttDestinationSettings: {},
          },
          LanguageCode: 'ENG',
          LanguageDescription: 'English',
        },
      ],
      NameModifier: '_captions_en',
      OutputSettings: {
        HlsSettings: {
          AudioGroupId: undefined,
        },
      },
    };
  }

  /**
   * Both-orientation output plan. The portrait (9:16) set keeps the exact
   * historical layout so existing readers (s3Keys.content.exercise) are
   * unaffected:
   *   {base}/video.m3u8 + _720p/_480p/_360p, video_audio.mp4,
   *   video_poster.*.jpg, video_thumbnail.*.jpg
   * The wide (16:9) set mirrors that one directory deeper under `wide/`:
   *   {base}/wide/video.m3u8 + rungs, wide/video_poster.*.jpg,
   *   wide/video_thumbnail.*.jpg
   * so the two never collide and the wide URLs are equally derivable.
   *
   * When `withCaptions` is true, an English WEBVTT_HLS subtitle track
   * is appended to the portrait HLS group; the wide group is left
   * caption-free since the SUBTITLES group on the master playlist is
   * shared. (HLS supports one SUBTITLES group per master and both
   * orientations point to the same set of captions.)
   */
  private buildOutputGroups(
    outputS3Folder: string,
    wideCrop?: Rectangle,
    withCaptions = false,
  ): OutputGroup[] {
    const wideFolder = `${outputS3Folder}wide/`;
    const portraitOutputs: Output[] = PORTRAIT_RUNGS.map((rung) => this.hlsVideoOutput(rung));
    if (withCaptions) {
      portraitOutputs.push(this.subtitlesHlsOutput());
    }
    const portraitGroup: OutputGroup = {
      CustomName: 'video',
      Name: 'Apple HLS',
      Outputs: portraitOutputs,
      OutputGroupSettings: {
        Type: 'HLS_GROUP_SETTINGS',
        HlsGroupSettings: {
          SegmentLength: 10,
          Destination: outputS3Folder,
          MinSegmentLength: 0,
        },
      },
    };
    return [
      // 9:16 primary (unchanged keys, never cropped — it is the source orientation)
      portraitGroup,
      this.audioGroup(outputS3Folder),
      this.frameCaptureGroup('poster', outputS3Folder, 720, 1280, '_poster'),
      this.frameCaptureGroup('thumbnail', outputS3Folder, 180, 320, '_thumbnail'),
      // 16:9 companion under wide/ — cropped to frame the person when a smart
      // crop rect is supplied, else aspect-preserving (letterboxed).
      this.hlsGroup('video_wide', wideFolder, WIDE_RUNGS, wideCrop),
      this.frameCaptureGroup('poster_wide', wideFolder, 1280, 720, '_poster', wideCrop),
      this.frameCaptureGroup('thumbnail_wide', wideFolder, 320, 180, '_thumbnail', wideCrop),
    ];
  }

  async createJob({
    inputURL,
    outputS3Folder,
    watermarkURL,
    wideCrop,
    captionInputUrl,
  }: {
    inputURL: string;
    outputS3Folder: string;
    watermarkURL?: string;
    /** Crop rect (source px) applied to the 16:9 wide outputs for smart framing. */
    wideCrop?: Rectangle | null;
    /**
     * Optional sidecar WEBVTT file URL (S3). When provided, MediaConvert
     * reads it as caption source and emits an English SUBTITLES group
     * in the master HLS playlist. The asset's MediaAsset DTO doesn't
     * need a separate `captionUrl` — the manifest exposes the track
     * automatically and the player chrome picks it up via hls.js's
     * SUBTITLE_TRACKS_UPDATED event.
     */
    captionInputUrl?: string | null;
  }) {
    if (this.configService.disableMediaConvert) {
      return null;
    }
    const imageInserter = watermarkURL
      ? {
          ImageInserter: {
            InsertableImages: [
              {
                Width: 220,
                Height: 220,
                ImageX: 500,
                ImageY: 1060,
                Layer: 1,
                ImageInserterInput: watermarkURL,
                Opacity: 90,
              },
            ],
          },
        }
      : {};

    // When a sidecar VTT is supplied, attach it as a caption selector
    // on the input. The output side (`buildOutputGroups(..., true)`)
    // then knows to emit a WEBVTT_HLS subtitle output that references
    // this selector. No-op when captionInputUrl is null/empty — keeps
    // the existing caption-free pipeline pristine for the vast
    // majority of jobs that don't have authored captions yet.
    const withCaptions = !!captionInputUrl;
    // SDK enum strings need to be literal-typed for the Input shape's
    // `Record<string, CaptionSelector>` index signature — `as const`
    // narrows the strings without us hand-importing each enum union.
    const captionSelectors = withCaptions
      ? ({
          CaptionSelectors: {
            'Captions Selector 1': {
              LanguageCode: 'ENG',
              SourceSettings: {
                SourceType: 'WEBVTT',
                FileSourceSettings: {
                  SourceFile: captionInputUrl!,
                },
              },
            },
          },
        } as const)
      : {};

    const params: CreateJobCommandInput = {
      Queue: this.mediaConvertQueue,
      UserMetadata: {},
      Role: this.mediaConvertRole,
      Settings: {
        TimecodeConfig: {
          Source: 'ZEROBASED',
        },
        OutputGroups: this.buildOutputGroups(outputS3Folder, wideCrop ?? undefined, withCaptions),
        FollowSource: 1,
        Inputs: [
          {
            AudioSelectors: {
              'Audio Selector 1': {
                DefaultSelection: 'DEFAULT',
              },
            },
            AudioSelectorGroups: {
              'Audio Selector Group 1': {
                AudioSelectorNames: ['Audio Selector 1'],
              },
            },
            VideoSelector: {
              Rotate: 'AUTO',
            },
            TimecodeSource: 'ZEROBASED',
            ...imageInserter,
            ...captionSelectors,
            FileInput: inputURL,
          },
        ],
      },
      BillingTagsSource: 'JOB',
      AccelerationSettings: {
        Mode: 'DISABLED',
      },
      StatusUpdateInterval: 'SECONDS_60',
      Priority: 0,
    };
    try {
      const data = await this.mediaConvertClient.send(new CreateJobCommand(params));
      this.logger.log('Job created!', data);
      return data.Job!;
    } catch (error) {
      this.logger.error(error, error.stack);
      return null;
    }
  }

  async getJob(id: string) {
    const params: GetJobCommandInput = { Id: id };
    const result = await this.mediaConvertClient.send(new GetJobCommand(params));
    return result.Job;
  }

  async cancelJob(id: string) {
    const params: CancelJobCommandInput = { Id: id };
    await this.mediaConvertClient.send(new CancelJobCommand(params));
  }
}
