import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { ContentItemRepository } from 'src/repositories/content-item.repository';

import { ContentItemsApiController } from './content-items-api.controller';
import { ContentItemsApiService } from './content-items-api.service';

@Module({})
export class ContentItemsApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: ContentItemsApiModule,
        imports: [AuthModule.register(), S3Module.register()],
        providers: [ContentItemsApiService, ContentItemRepository],
        controllers: [ContentItemsApiController],
        exports: [ContentItemsApiService, ContentItemRepository],
      };
    }
    return this.instance;
  }
}
