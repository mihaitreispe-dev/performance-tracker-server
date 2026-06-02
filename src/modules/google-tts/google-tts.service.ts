import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from 'src/modules/config/app-config.service';

/**
 * Wrapper around Google Cloud Text-to-Speech for the exercise
 * voice-over feature.
 *
 * Lazy-loads the client on first call — the GCP SDK pulls in a fair
 * amount of code (gRPC, auth) and we don't want to pay that cost on
 * every cold boot of the server when most requests never touch TTS.
 *
 * Auth: the SDK reads GOOGLE_APPLICATION_CREDENTIALS from the
 * environment, pointing at a service-account JSON file (or uses
 * workload identity in GKE / Cloud Run). We don't pass credentials
 * inline — keeping that surface invisible from app code means
 * rotating the key is an env-only change.
 *
 * When `enableGoogleTts` is false (default), every call throws
 * ServiceUnavailableException. The exercise voice-over endpoint
 * catches that + the client falls back to the Web Speech API on
 * playback.
 */
@Injectable()
export class GoogleTtsService {
  private readonly logger = new Logger(GoogleTtsService.name);

  // Hold the imported SDK + a single client instance across calls.
  // The client is thread-safe and reuses its gRPC channel — creating
  // a fresh one per synthesise call would re-handshake auth every
  // time (~500ms+).
  private clientPromise: Promise<unknown> | null = null;

  constructor(private readonly configService: AppConfigService) {}

  private async getClient(): Promise<{
    synthesizeSpeech: (req: unknown) => Promise<[{ audioContent?: Buffer | Uint8Array | string }]>;
  }> {
    if (!this.configService.enableGoogleTts) {
      throw new ServiceUnavailableException(
        'Google TTS is not enabled on this server (set ENABLE_GOOGLE_TTS=Y + GOOGLE_APPLICATION_CREDENTIALS).',
      );
    }
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const mod = await import('@google-cloud/text-to-speech');
        // The package exposes the client as a named export.
        const TextToSpeechClient = mod.TextToSpeechClient;
        return new TextToSpeechClient();
      })();
    }
    return this.clientPromise as Promise<{
      synthesizeSpeech: (req: unknown) => Promise<[{ audioContent?: Buffer | Uint8Array | string }]>;
    }>;
  }

  /**
   * Generate an MP3 from text. Returns the raw audio bytes; caller
   * uploads to S3.
   *
   * `voiceName` is the GCP voice id (e.g. 'en-US-Neural2-J'). Falls
   * back to the configured default. Language code is derived from the
   * voice name's prefix — every GCP voice id is shaped `xx-YY-...`
   * so we can read the locale without an extra parameter.
   */
  async synthesizeMp3(text: string, voiceName?: string): Promise<Buffer> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Cannot synthesise empty text');
    }
    // Cap the script length defensively — the player's voice-over
    // slot is meant for brief cues, not narration. 5000 chars matches
    // the GCP API hard limit for a single synthesize call and
    // protects against accidental novel-length payloads.
    const MAX_CHARS = 5000;
    const input = trimmed.length > MAX_CHARS ? trimmed.slice(0, MAX_CHARS) : trimmed;

    const client = await this.getClient();
    const voice = voiceName ?? this.configService.googleTtsVoice;
    // Derive language code from the voice name (first two segments
    // joined). Wavenet/Neural2 voices always follow this naming.
    const languageCode = voice.split('-').slice(0, 2).join('-');

    const [response] = await client.synthesizeSpeech({
      input: { text: input },
      voice: { name: voice, languageCode },
      // MP3 is widely-decodable across every player + small enough
      // for a cue. LINEAR16 / OGG_OPUS would save bytes but cost
      // compatibility (Safari's <audio> chokes on Opus in some
      // versions).
      audioConfig: { audioEncoding: 'MP3' },
    });

    const content = response.audioContent;
    if (!content) {
      throw new Error('Google TTS returned no audio content');
    }
    if (Buffer.isBuffer(content)) return content;
    if (content instanceof Uint8Array) return Buffer.from(content);
    // Some SDK versions return base64-encoded string on the JSON
    // transport path; defensive decode covers both.
    return Buffer.from(content, 'base64');
  }
}
