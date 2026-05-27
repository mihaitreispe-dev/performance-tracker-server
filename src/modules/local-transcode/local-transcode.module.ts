import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { ExerciseRepository } from 'src/repositories/exercise.repository';

import { LocalTranscodeService } from './local-transcode.service';

@Module({})
export class LocalTranscodeModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: LocalTranscodeModule,
        imports: [AppConfigModule.register(), S3Module.register()],
        providers: [LocalTranscodeService, ExerciseRepository],
        exports: [LocalTranscodeService],
      };
    }
    return this.instance;
  }
}
