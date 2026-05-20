import { DynamicModule, Module } from '@nestjs/common';

import { AppConfigModule } from 'src/modules/config/app-config.module';

import { StripeService } from './stripe.service';

@Module({})
export class StripeModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: StripeModule,
        imports: [AppConfigModule.register()],
        providers: [StripeService],
        exports: [StripeService],
      };
    }
    return this.instance;
  }
}
