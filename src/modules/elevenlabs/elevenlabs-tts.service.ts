import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from 'src/modules/config/app-config.service';

const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

/**
 * ElevenLabs text-to-speech for the cloned-voice dub (Layer 2). Renders
 * approved translated text into an MP3 in a given voice — the coach's
 * cloned voice when they've enrolled + consented, otherwise a configured
 * default voice. The multilingual model speaks the target language from
 * the text itself, so no per-language voice swapping is needed.
 *
 * Synchronous HTTP, so callers run it from the translation cron rather
 * than a request handler.
 */
@Injectable()
export class ElevenLabsTtsService {
  private readonly logger = new Logger(ElevenLabsTtsService.name);

  constructor(private readonly configService: AppConfigService) {}

  get enabled(): boolean {
    return !!this.configService.elevenLabsApiKey;
  }

  /** Synthesise `text` in `voiceId`; returns the MP3 bytes. */
  async synthesize(text: string, voiceId: string): Promise<Buffer> {
    const apiKey = this.configService.elevenLabsApiKey;
    if (!apiKey) {
      throw new ServiceUnavailableException('ElevenLabs is not configured (set ELEVENLABS_API_KEY).');
    }
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Cannot synthesise empty text.');

    const res = await fetch(`${ELEVENLABS_TTS_URL}/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: trimmed,
        model_id: this.configService.elevenLabsTtsModel,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`ElevenLabs TTS failed (${res.status}): ${body.slice(0, 500)}`);
      throw new Error(`ElevenLabs TTS failed with status ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
