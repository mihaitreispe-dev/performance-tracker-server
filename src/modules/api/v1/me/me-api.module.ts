import { DynamicModule, Module } from '@nestjs/common';

import { AuthModule } from 'src/modules/auth/auth.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { ResourceEntitlementsRepository } from 'src/repositories/resource-entitlements.repository';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { MeApiController } from './me-api.controller';
import { MeApiService } from './me-api.service';

/**
 * The per-user "me" surface — entitlements, featured content,
 * device-token registration. JWT-authenticated, X-Organisation-Id
 * scoped. Reuses StripeBillingRepository + ResourceEntitlementsRepository
 * already provided to PublicApiModule but registers them locally so
 * this module is independently importable.
 */
@Module({})
export class MeApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: MeApiModule,
        imports: [AuthModule.register(), S3Module.register()],
        providers: [
          MeApiService,
          UserRepository,
          StripeBillingRepository,
          ResourceEntitlementsRepository,
        ],
        controllers: [MeApiController],
      };
    }
    return this.instance;
  }
}
