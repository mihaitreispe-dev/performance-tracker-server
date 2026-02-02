import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Env } from 'src/env';

import { AppConfigService } from './app-config.service';

@Module({})
export class AppConfigModule {
  private static rootInstance?: DynamicModule;
  private static instance?: DynamicModule;

  static forRoot(): DynamicModule {
    if (!this.rootInstance) {
      this.rootInstance = {
        module: AppConfigModule,
        imports: [
          ConfigModule.forRoot({
            envFilePath: ['.env'],
            validate: Env.validate,
          }),
        ],
        providers: [AppConfigService],
      };
    }
    return this.rootInstance;
  }

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: AppConfigModule,
        imports: [ConfigModule],
        providers: [AppConfigService],
        exports: [AppConfigService],
      };
    }
    return this.instance;
  }
}
