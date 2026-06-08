import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { ResourceEntitlementsRepository } from 'src/repositories/resource-entitlements.repository';
import { SnackCompletionRepository } from 'src/repositories/snack-completion.repository';
import { SnackScheduleRepository } from 'src/repositories/snack-schedule.repository';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';

import { ContentItemsApiController } from './content-items-api.controller';
import { ContentItemsApiService } from './content-items-api.service';

@Module({})
export class ContentItemsApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: ContentItemsApiModule,
        imports: [AuthModule.register(), AppConfigModule.register(), S3Module.register()],
        providers: [
          ContentItemsApiService,
          ContentItemRepository,
          // Used by ContentItemsApiService.computeLockMap to stamp
          // per-caller `locked` on the list + getById DTOs. Same shape
          // as the featured-content lock stamping in MeApiService.
          ResourceEntitlementsRepository,
          StripeBillingRepository,
          // One-row-per-play log for the rehabit history view.
          // See migration 1774404000000.
          SnackCompletionRepository,
          // Scheduled snacks for the calendar. See migration
          // 1774404100000.
          SnackScheduleRepository,
        ],
        controllers: [ContentItemsApiController],
        exports: [ContentItemsApiService, ContentItemRepository],
      };
    }
    return this.instance;
  }
}
