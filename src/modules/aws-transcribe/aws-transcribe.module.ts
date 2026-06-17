import { Global, Module } from '@nestjs/common';

import { AppConfigModule } from '../config/app-config.module';
import { S3Module } from '../s3/s3.module';
import { AwsTranscribeService } from './aws-transcribe.service';

/**
 * @Global so the translations feature injects AwsTranscribeService
 * without re-importing. Pulls in S3Module so the service can read the
 * transcript JSON Transcribe writes to the content bucket.
 */
@Global()
@Module({
  imports: [AppConfigModule.register(), S3Module.register()],
  providers: [AwsTranscribeService],
  exports: [AwsTranscribeService],
})
export class AwsTranscribeModule {}
