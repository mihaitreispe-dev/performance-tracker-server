import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from 'src/modules/config/app-config.service';

const ELEVENLABS_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

export interface SttResult {
  text: string;
  /** Detected language code, when ElevenLabs returns one. */
  languageCode?: string;
}

/**
 * ElevenLabs Scribe speech-to-text. Synchronous HTTP (no job/poll), so
 * callers run it from a background worker (the translation cron) rather
 * than a request handler — a multi-minute intro can take a while.
 *
 * We hand ElevenLabs a `cloud_storage_url` (a presigned S3 GET URL) so
 * the audio/video never streams through our process; ElevenLabs fetches
 * it directly. Enabled whenever ELEVENLABS_API_KEY is set.
 */
@Injectable()
export class ElevenLabsSttService {
  private readonly logger = new Logger(ElevenLabsSttService.name);

  constructor(private readonly configService: AppConfigService) {}

  get enabled(): boolean {
    return !!this.configService.elevenLabsApiKey;
  }

  /**
   * Transcribe the media at `mediaUrl` (a presigned, fetchable URL).
   * `languageCode` is an optional ISO hint (e.g. 'en'); omit to let
   * Scribe auto-detect.
   */
  async transcribe(mediaUrl: string, languageCode?: string): Promise<SttResult> {
    const apiKey = this.configService.elevenLabsApiKey;
    if (!apiKey) {
      throw new ServiceUnavailableException('ElevenLabs is not configured (set ELEVENLABS_API_KEY).');
    }

    const form = new FormData();
    form.append('model_id', this.configService.elevenLabsSttModel);
    form.append('cloud_storage_url', mediaUrl);
    if (languageCode) form.append('language_code', languageCode);

    const res = await fetch(ELEVENLABS_STT_URL, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`ElevenLabs STT failed (${res.status}): ${body.slice(0, 500)}`);
      throw new Error(`ElevenLabs STT failed with status ${res.status}`);
    }

    const json = (await res.json()) as { text?: string; language_code?: string };
    return { text: (json.text ?? '').trim(), languageCode: json.language_code };
  }
}
