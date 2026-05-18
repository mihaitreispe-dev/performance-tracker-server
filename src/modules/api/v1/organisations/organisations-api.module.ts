import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { OrganisationRepository } from 'src/repositories/organisation.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { MembershipsApiController } from './memberships/memberships-api.controller';
import { MembershipsApiService } from './memberships/memberships-api.service';
import { OrganisationsApiController } from './organisations-api.controller';
import { OrganisationsApiService } from './organisations-api.service';

@Module({})
export class OrganisationsApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: OrganisationsApiModule,
        imports: [AuthModule.register()],
        providers: [
          OrganisationsApiService,
          MembershipsApiService,
          OrganisationRepository,
          OrganisationMembershipRepository,
          UserRepository,
        ],
        controllers: [OrganisationsApiController, MembershipsApiController],
        exports: [OrganisationsApiService, OrganisationRepository, OrganisationMembershipRepository],
      };
    }
    return this.instance;
  }
}
