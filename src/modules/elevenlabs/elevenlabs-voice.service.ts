import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from 'src/modules/config/app-config.service';

const ELEVENLABS_VOICES_URL = 'https://api.elevenlabs.io/v1/voices';

/**
 * ElevenLabs voice management for the Instant Voice Clone enrollment
 * flow: mint a cloned voice from a coach's audio sample, and delete it.
 * The resulting voice id is stored on the user and used by the dub.
 *
 * Cloning a real person's voice requires their explicit consent — the
 * caller (MeApiService) enforces the consent flag before calling here.
 */
@Injectable()
export class ElevenLabsVoiceService {
  private readonly logger = new Logger(ElevenLabsVoiceService.name);

  constructor(private readonly configService: AppConfigService) {}

  get enabled(): boolean {
    return !!this.configService.elevenLabsApiKey;
  }

  /** Create an Instant Voice Clone from one sample; returns the voice id. */
  async cloneVoice(opts: { name: string; audio: Buffer; filename: string; mimeType: string }): Promise<string> {
    const apiKey = this.configService.elevenLabsApiKey;
    if (!apiKey) {
      throw new ServiceUnavailableException('ElevenLabs is not configured (set ELEVENLABS_API_KEY).');
    }

    const form = new FormData();
    form.append('name', opts.name);
    form.append('files', new Blob([new Uint8Array(opts.audio)], { type: opts.mimeType }), opts.filename);

    const res = await fetch(`${ELEVENLABS_VOICES_URL}/add`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`ElevenLabs voice clone failed (${res.status}): ${body.slice(0, 500)}`);
      throw new Error(`ElevenLabs voice clone failed with status ${res.status}`);
    }

    const json = (await res.json()) as { voice_id?: string };
    if (!json.voice_id) throw new Error('ElevenLabs voice clone returned no voice_id.');
    return json.voice_id;
  }

  /** Delete a cloned voice. Swallows "already gone" so unenroll is idempotent. */
  async deleteVoice(voiceId: string): Promise<void> {
    const apiKey = this.configService.elevenLabsApiKey;
    if (!apiKey) return;
    try {
      const res = await fetch(`${ELEVENLABS_VOICES_URL}/${encodeURIComponent(voiceId)}`, {
        method: 'DELETE',
        headers: { 'xi-api-key': apiKey },
      });
      if (!res.ok && res.status !== 404) {
        this.logger.warn(`ElevenLabs voice delete returned ${res.status} for ${voiceId}`);
      }
    } catch (e) {
      // Non-fatal — we still clear the local pointer so the coach can re-enroll.
      this.logger.warn(`ElevenLabs voice delete failed for ${voiceId}: ${String(e)}`);
    }
  }
}
