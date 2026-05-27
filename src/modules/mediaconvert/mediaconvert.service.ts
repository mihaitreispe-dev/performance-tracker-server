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

  private hlsVideoOutput(rung: VideoRung): Output {
    return {
      ContainerSettings: {
        Container: 'M3U8',
        M3u8Settings: {},
      },
      VideoDescription: {
        Width: rung.width,
        Height: rung.height,
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
  private hlsGroup(customName: string, destination: string, rungs: VideoRung[]): OutputGroup {
    return {
      CustomName: customName,
      Name: 'Apple HLS',
      Outputs: rungs.map((rung) => this.hlsVideoOutput(rung)),
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
   * Both-orientation output plan. The portrait (9:16) set keeps the exact
   * historical layout so existing readers (s3Keys.content.exercise) are
   * unaffected:
   *   {base}/video.m3u8 + _720p/_480p/_360p, video_audio.mp4,
   *   video_poster.*.jpg, video_thumbnail.*.jpg
   * The wide (16:9) set mirrors that one directory deeper under `wide/`:
   *   {base}/wide/video.m3u8 + rungs, wide/video_poster.*.jpg,
   *   wide/video_thumbnail.*.jpg
   * so the two never collide and the wide URLs are equally derivable.
   */
  private buildOutputGroups(outputS3Folder: string): OutputGroup[] {
    const wideFolder = `${outputS3Folder}wide/`;
    return [
      // 9:16 primary (unchanged keys)
      this.hlsGroup('video', outputS3Folder, PORTRAIT_RUNGS),
      this.audioGroup(outputS3Folder),
      this.frameCaptureGroup('poster', outputS3Folder, 720, 1280, '_poster'),
      this.frameCaptureGroup('thumbnail', outputS3Folder, 180, 320, '_thumbnail'),
      // 16:9 companion under wide/
      this.hlsGroup('video_wide', wideFolder, WIDE_RUNGS),
      this.frameCaptureGroup('poster_wide', wideFolder, 1280, 720, '_poster'),
      this.frameCaptureGroup('thumbnail_wide', wideFolder, 320, 180, '_thumbnail'),
    ];
  }

  async createJob({
    inputURL,
    outputS3Folder,
    watermarkURL,
  }: {
    inputURL: string;
    outputS3Folder: string;
    watermarkURL?: string;
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

    const params: CreateJobCommandInput = {
      Queue: this.mediaConvertQueue,
      UserMetadata: {},
      Role: this.mediaConvertRole,
      Settings: {
        TimecodeConfig: {
          Source: 'ZEROBASED',
        },
        OutputGroups: this.buildOutputGroups(outputS3Folder),
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
