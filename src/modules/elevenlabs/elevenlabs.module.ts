import { Global, Module } from '@nestjs/common';

import { AppConfigModule } from '../config/app-config.module';
import { ElevenLabsSttService } from './elevenlabs-stt.service';
import { ElevenLabsTtsService } from './elevenlabs-tts.service';
import { ElevenLabsVoiceService } from './elevenlabs-voice.service';

/**
 * ElevenLabs integration — Scribe STT (Layer 1 transcription), TTS for
 * the cloned-voice dub (Layer 2), and voice management (Instant Voice
 * Clone enrollment). @Global so features inject these without
 * re-importing.
 */
@Global()
@Module({
  imports: [AppConfigModule.register()],
  providers: [ElevenLabsSttService, ElevenLabsTtsService, ElevenLabsVoiceService],
  exports: [ElevenLabsSttService, ElevenLabsTtsService, ElevenLabsVoiceService],
})
export class ElevenLabsModule {}
