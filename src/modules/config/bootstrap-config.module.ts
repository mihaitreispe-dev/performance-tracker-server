import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BoostrapEnv } from 'src/env';

import { BootstrapConfigService } from './bootstrap-config.service';

@Module({})
export class BootstrapConfigModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: BootstrapConfigModule,
        imports: [
          ConfigModule.forRoot({
            envFilePath: ['.env'],
            validate: BoostrapEnv.validate,
          }),
        ],
        providers: [BootstrapConfigService],
        exports: [BootstrapConfigService],
      };
    }
    return this.instance;
  }
}
