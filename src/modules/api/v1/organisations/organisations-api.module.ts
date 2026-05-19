import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { OrganisationRepository } from 'src/repositories/organisation.repository';
import { OrganisationApiKeyRepository } from 'src/repositories/organisation-api-key.repository';
import { OrganisationApiUsageRepository } from 'src/repositories/organisation-api-usage.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { OrganisationThemeRepository } from 'src/repositories/organisation-theme.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { ApiKeysApiController } from './api-keys/api-keys-api.controller';
import { ApiKeysApiService } from './api-keys/api-keys-api.service';
import { MembershipsApiController } from './memberships/memberships-api.controller';
import { MembershipsApiService } from './memberships/memberships-api.service';
import { OrganisationsApiController } from './organisations-api.controller';
import { OrganisationsApiService } from './organisations-api.service';
import { ThemesApiController } from './themes/themes-api.controller';
import { ThemesApiService } from './themes/themes-api.service';

@Module({})
export class OrganisationsApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: OrganisationsApiModule,
        imports: [AuthModule.register(), S3Module.register()],
        providers: [
          OrganisationsApiService,
          MembershipsApiService,
          ThemesApiService,
          ApiKeysApiService,
          OrganisationRepository,
          OrganisationMembershipRepository,
          OrganisationThemeRepository,
          OrganisationApiKeyRepository,
          OrganisationApiUsageRepository,
          UserRepository,
        ],
        controllers: [
          OrganisationsApiController,
          MembershipsApiController,
          ThemesApiController,
          ApiKeysApiController,
        ],
        exports: [
          OrganisationsApiService,
          OrganisationRepository,
          OrganisationMembershipRepository,
          OrganisationApiKeyRepository,
          OrganisationApiUsageRepository,
        ],
      };
    }
    return this.instance;
  }
}
