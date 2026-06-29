import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from 'src/modules/config/app-config.service';

const DUBBING_URL = 'https://api.elevenlabs.io/v1/dubbing';

/** ElevenLabs dubbing project status. */
export type DubbingStatus = 'dubbing' | 'dubbed' | 'failed';

/**
 * ElevenLabs Dubbing — the single ElevenLabs operation that transcribes,
 * translates AND re-voices a clip into a target language, automatically
 * cloning the source speaker's voice (so a coach's narration keeps their
 * voice in every language with no separate enrollment).
 *
 * This replaces the old three-step Scribe-STT → AWS-Translate → TTS-dub
 * pipeline: there's no standalone text-translation step anymore, so AWS
 * Translate is out of the path entirely.
 *
 * We feed it an extracted MP3 (audio in → MP3 out; a video input would
 * come back as MP4, which doesn't fit the player's audio-overlay model).
 * Dubbing is asynchronous: create returns a `dubbing_id`, then the cron
 * polls status and downloads the dubbed audio once it's `dubbed`.
 */
@Injectable()
export class ElevenLabsDubbingService {
  private readonly logger = new Logger(ElevenLabsDubbingService.name);

  constructor(private readonly configService: AppConfigService) {}

  get enabled(): boolean {
    return !!this.configService.elevenLabsApiKey;
  }

  private apiKey(): string {
    const key = this.configService.elevenLabsApiKey;
    if (!key) {
      throw new ServiceUnavailableException('ElevenLabs is not configured (set ELEVENLABS_API_KEY).');
    }
    return key;
  }

  /**
   * Create a dubbing job for ONE target language; returns its `dubbing_id`.
   * We upload the audio bytes directly (rather than `source_url`) so the
   * media never needs to be reachable from ElevenLabs' network — the same
   * reason the STT path uploads bytes for private/MinIO storage.
   */
  async createDub(opts: {
    audio: Buffer;
    filename: string;
    sourceLang: string;
    targetLang: string;
  }): Promise<string> {
    const form = new FormData();
    // Copy into a fresh Uint8Array so the Blob part is backed by a plain
    // ArrayBuffer (a raw Buffer narrows to ArrayBufferLike and isn't a BlobPart).
    form.append('file', new Blob([new Uint8Array(opts.audio)], { type: 'audio/mpeg' }), opts.filename);
    form.append('target_lang', opts.targetLang);
    form.append('source_lang', opts.sourceLang);

    const res = await fetch(DUBBING_URL, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey() },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Dubbing create failed (${res.status}): ${body.slice(0, 400)}`);
      throw new Error(`Dubbing create failed with status ${res.status}`);
    }
    const json = (await res.json()) as { dubbing_id?: string };
    if (!json.dubbing_id) throw new Error('Dubbing create returned no dubbing_id.');
    return json.dubbing_id;
  }

  /** Poll a dubbing project's status. */
  async getStatus(dubbingId: string): Promise<{ status: DubbingStatus; error?: string }> {
    const res = await fetch(`${DUBBING_URL}/${encodeURIComponent(dubbingId)}`, {
      headers: { 'xi-api-key': this.apiKey() },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Dubbing status failed (${res.status}): ${body.slice(0, 300)}`);
      throw new Error(`Dubbing status failed with status ${res.status}`);
    }
    const json = (await res.json()) as { status?: string; error?: string };
    return { status: (json.status as DubbingStatus) ?? 'dubbing', error: json.error };
  }

  /**
   * Download the dubbed audio for a language. Since we fed audio in, this
   * comes back as MP3 — ready to store as the translated voice-over.
   */
  async getDubbedAudio(dubbingId: string, languageCode: string): Promise<Buffer> {
    const res = await fetch(
      `${DUBBING_URL}/${encodeURIComponent(dubbingId)}/audio/${encodeURIComponent(languageCode)}`,
      { headers: { 'xi-api-key': this.apiKey() } },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Dubbing audio fetch failed (${res.status}): ${body.slice(0, 300)}`);
      throw new Error(`Dubbing audio fetch failed with status ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * Best-effort: the translated transcript as WebVTT, for the caption
   * track. Returns null on any failure — the dubbed audio is the primary
   * deliverable, so a missing caption never blocks publishing.
   */
  async getTranscriptVtt(dubbingId: string, languageCode: string): Promise<string | null> {
    try {
      const res = await fetch(
        `${DUBBING_URL}/${encodeURIComponent(dubbingId)}/transcript/${encodeURIComponent(
          languageCode,
        )}?format_type=webvtt`,
        { headers: { 'xi-api-key': this.apiKey() } },
      );
      if (!res.ok) return null;
      const text = await res.text();
      return text.trim() ? text : null;
    } catch {
      return null;
    }
  }
}
