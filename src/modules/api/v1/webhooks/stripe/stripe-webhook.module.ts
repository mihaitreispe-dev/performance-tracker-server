import { DynamicModule, Module } from '@nestjs/common';

import { AppConfigModule } from 'src/modules/config/app-config.module';
import { StripeModule } from 'src/modules/stripe/stripe.module';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';

import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';

@Module({})
export class StripeWebhookModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: StripeWebhookModule,
        imports: [AppConfigModule.register(), StripeModule.register()],
        providers: [StripeWebhookService, StripeBillingRepository],
        controllers: [StripeWebhookController],
      };
    }
    return this.instance;
  }
}
