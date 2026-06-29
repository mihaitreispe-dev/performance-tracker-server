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
 * We normally hand ElevenLabs a `cloud_storage_url` (a presigned S3 GET URL)
 * so the audio/video never streams through our process; ElevenLabs fetches
 * it directly. When the media lives on a private/local host that ElevenLabs'
 * cloud servers can't route to (e.g. a dev MinIO on the LAN), we download the
 * bytes ourselves — we're on the same network — and upload them directly as a
 * `file` instead. Enabled whenever ELEVENLABS_API_KEY is set.
 */
@Injectable()
export class ElevenLabsSttService {
  private readonly logger = new Logger(ElevenLabsSttService.name);

  constructor(private readonly configService: AppConfigService) {}

  get enabled(): boolean {
    return !!this.configService.elevenLabsApiKey;
  }

  /**
   * True when `url`'s host is loopback or RFC1918 private — ElevenLabs'
   * cloud servers can't fetch it, so we must proxy the bytes ourselves.
   */
  private isPrivateHost(url: string): boolean {
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return false;
    }
    return (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
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
    if (this.isPrivateHost(mediaUrl)) {
      // ElevenLabs can't reach a private/local endpoint; fetch the bytes
      // ourselves (we're on the same network) and upload them directly.
      const mediaRes = await fetch(mediaUrl);
      if (!mediaRes.ok) {
        const body = await mediaRes.text().catch(() => '');
        this.logger.error(`Failed to download STT media (${mediaRes.status}): ${body.slice(0, 200)}`);
        throw new Error(`Failed to download STT media with status ${mediaRes.status}`);
      }
      const blob = await mediaRes.blob();
      const filename = (() => {
        try {
          return new URL(mediaUrl).pathname.split('/').pop() || 'media';
        } catch {
          return 'media';
        }
      })();
      form.append('file', blob, filename);
    } else {
      form.append('cloud_storage_url', mediaUrl);
    }
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
