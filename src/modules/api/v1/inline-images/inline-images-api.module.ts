import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { InlineImageRepository } from 'src/repositories/inline-image.repository';

import { InlineImagesApiController } from './inline-images-api.controller';
import { InlineImagesApiService } from './inline-images-api.service';

@Module({})
export class InlineImagesApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: InlineImagesApiModule,
        imports: [AuthModule.register(), AppConfigModule.register(), S3Module.register()],
        providers: [InlineImagesApiService, InlineImageRepository],
        controllers: [InlineImagesApiController],
        exports: [InlineImagesApiService, InlineImageRepository],
      };
    }
    return this.instance;
  }
}
