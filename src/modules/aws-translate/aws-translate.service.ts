import { Translate, type TranslateClientConfig } from '@aws-sdk/client-translate';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from 'src/modules/config/app-config.service';

/**
 * Thin wrapper around AWS Translate for the content-translation
 * pipeline (voice-over scripts + transcribed intros).
 *
 * Off by default — when `enableAwsTranslate` is false every call throws
 * ServiceUnavailable, so the feature ships dark until an org turns it
 * on. Uses the same credential strategy as S3Service / MediaConvertService:
 * an explicit key when one is configured, otherwise the default chain
 * (the Fargate task role) so no long-lived keys ship in the container.
 *
 * The client is constructed once in the constructor — the v3 SDK client
 * is lightweight (unlike the GCP TTS SDK) and shares its HTTP agent
 * across calls.
 */
@Injectable()
export class AwsTranslateService {
  private readonly logger = new Logger(AwsTranslateService.name);
  private readonly client: Translate;

  constructor(private readonly configService: AppConfigService) {
    const explicitKey = this.configService.awsAccessKey;
    const opts: TranslateClientConfig = {
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
    this.client = new Translate(opts);
  }

  get enabled(): boolean {
    return this.configService.enableAwsTranslate;
  }

  /**
   * Translate a block of text. `sourceLocale`/`targetLocale` are
   * language codes Translate accepts (e.g. 'en', 'es', 'fr', 'de').
   * Pass 'auto' as the source to let Translate detect it.
   *
   * AWS caps a single TranslateText call at 10,000 bytes of UTF-8; a
   * coaching script is far shorter, but we guard defensively and log
   * if we ever clip.
   */
  async translateText(text: string, targetLocale: string, sourceLocale = 'en'): Promise<string> {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'AWS Translate is not enabled on this server (set ENABLE_AWS_TRANSLATE=Y).',
      );
    }
    const trimmed = text.trim();
    if (!trimmed) return '';

    const MAX_BYTES = 10000;
    let input = trimmed;
    if (Buffer.byteLength(input, 'utf8') > MAX_BYTES) {
      this.logger.warn(`Translate input exceeds ${MAX_BYTES} bytes; clipping.`);
      input = Buffer.from(input, 'utf8').subarray(0, MAX_BYTES).toString('utf8');
    }

    const res = await this.client.translateText({
      Text: input,
      SourceLanguageCode: sourceLocale,
      TargetLanguageCode: targetLocale,
    });
    return res.TranslatedText ?? '';
  }
}
