import {
  CancelJobCommand,
  CancelJobCommandInput,
  CreateJobCommand,
  CreateJobCommandInput,
  GetJobCommand,
  GetJobCommandInput,
  MediaConvert,
  MediaConvertClientConfig,
} from '@aws-sdk/client-mediaconvert';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from 'src/modules/config/app-config.service';

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
        OutputGroups: [
          {
            CustomName: 'video',
            Name: 'Apple HLS',
            Outputs: [
              {
                ContainerSettings: {
                  Container: 'M3U8',
                  M3u8Settings: {},
                },
                VideoDescription: {
                  Width: 720,
                  Height: 1280,
                  CodecSettings: {
                    Codec: 'H_264',
                    H264Settings: {
                      MaxBitrate: 5242880,
                      RateControlMode: 'QVBR',
                      SceneChangeDetect: 'TRANSITION_DETECTION',
                    },
                  },
                },
                AudioDescriptions: [
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
                ],
                OutputSettings: {
                  HlsSettings: {},
                },
                NameModifier: '_720p',
              },
              {
                ContainerSettings: {
                  Container: 'M3U8',
                  M3u8Settings: {},
                },
                VideoDescription: {
                  Width: 480,
                  Height: 854,
                  CodecSettings: {
                    Codec: 'H_264',
                    H264Settings: {
                      MaxBitrate: 2621440,
                      RateControlMode: 'QVBR',
                      SceneChangeDetect: 'TRANSITION_DETECTION',
                    },
                  },
                },
                AudioDescriptions: [
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
                ],
                OutputSettings: {
                  HlsSettings: {},
                },
                NameModifier: '_480p',
              },
              {
                ContainerSettings: {
                  Container: 'M3U8',
                  M3u8Settings: {},
                },
                VideoDescription: {
                  Width: 360,
                  Height: 640,
                  CodecSettings: {
                    Codec: 'H_264',
                    H264Settings: {
                      MaxBitrate: 1048576,
                      RateControlMode: 'QVBR',
                      SceneChangeDetect: 'TRANSITION_DETECTION',
                    },
                  },
                },
                AudioDescriptions: [
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
                ],
                OutputSettings: {
                  HlsSettings: {},
                },
                NameModifier: '_360p',
              },
            ],
            OutputGroupSettings: {
              Type: 'HLS_GROUP_SETTINGS',
              HlsGroupSettings: {
                SegmentLength: 10,
                Destination: outputS3Folder,
                MinSegmentLength: 0,
              },
            },
          },
          {
            CustomName: 'audio',
            Name: 'File Group',
            Outputs: [
              {
                ContainerSettings: {
                  Container: 'MP4',
                  Mp4Settings: {},
                },
                AudioDescriptions: [
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
                ],
                NameModifier: '_audio',
              },
            ],
            OutputGroupSettings: {
              Type: 'FILE_GROUP_SETTINGS',
              FileGroupSettings: {
                Destination: outputS3Folder,
              },
            },
          },
          {
            CustomName: 'poster',
            Name: 'File Group',
            Outputs: [
              {
                ContainerSettings: {
                  Container: 'RAW',
                },
                VideoDescription: {
                  Width: 720,
                  Height: 1280,
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
                NameModifier: '_poster',
              },
            ],
            OutputGroupSettings: {
              Type: 'FILE_GROUP_SETTINGS',
              FileGroupSettings: {
                Destination: outputS3Folder,
              },
            },
          },
          {
            CustomName: 'thumbnail',
            Name: 'File Group',
            Outputs: [
              {
                ContainerSettings: {
                  Container: 'RAW',
                },
                VideoDescription: {
                  Width: 180,
                  Height: 320,
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
                NameModifier: '_thumbnail',
              },
            ],
            OutputGroupSettings: {
              Type: 'FILE_GROUP_SETTINGS',
              FileGroupSettings: {
                Destination: outputS3Folder,
              },
            },
          },
        ],
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
