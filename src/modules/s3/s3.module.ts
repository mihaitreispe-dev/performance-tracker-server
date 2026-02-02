import { HttpModule } from '@nestjs/axios';
import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';

import { S3Service } from './s3.service';

@Module({})
export class S3Module {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: S3Module,
        imports: [AppConfigModule.register(), HttpModule],
        providers: [S3Service],
        exports: [S3Service],
      };
    }
    return this.instance;
  }
}
