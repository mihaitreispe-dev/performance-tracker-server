import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { TranslationsService } from 'src/modules/translations/translations.service';

/**
 * Advances in-flight AWS Transcribe jobs for the content-translation
 * pipeline. Mirrors CronService's MediaConvert/Rekognition pollers: the
 * job handle lives on the content_translations row, so a process restart
 * resumes cleanly. No-ops when Transcribe is disabled.
 */
@Injectable()
export class TranslationsCronService {
  private readonly logger = new Logger(TranslationsCronService.name);

  constructor(private readonly translationsService: TranslationsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async syncTranscriptionJobs() {
    try {
      await this.translationsService.advanceTranscriptionJobs();
    } catch (error) {
      this.logger.error('Failed to advance translation transcription jobs', error as Error);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async syncDubJobs() {
    try {
      await this.translationsService.advanceDubJobs();
    } catch (error) {
      this.logger.error('Failed to advance translation dub jobs', error as Error);
    }
  }
}
