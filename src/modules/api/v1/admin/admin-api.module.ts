import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { OrganisationApiKeyRepository } from 'src/repositories/organisation-api-key.repository';
import { OrganisationApiUsageRepository } from 'src/repositories/organisation-api-usage.repository';
import { OrganisationRepository } from 'src/repositories/organisation.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { OrganisationThemeRepository } from 'src/repositories/organisation-theme.repository';
import { ModuleRepository } from 'src/repositories/module.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { AdminApiController } from './admin-api.controller';
import { AdminApiService } from './admin-api.service';

@Module({})
export class AdminApiModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: AdminApiModule,
        imports: [AuthModule.register(), S3Module.register()],
        providers: [
          AdminApiService,
          UserRepository,
          OrganisationRepository,
          OrganisationMembershipRepository,
          OrganisationApiKeyRepository,
          OrganisationApiUsageRepository,
          ModuleRepository,
          OrganisationThemeRepository,
        ],
        controllers: [AdminApiController],
      };
    }
    return this.instance;
  }
}
