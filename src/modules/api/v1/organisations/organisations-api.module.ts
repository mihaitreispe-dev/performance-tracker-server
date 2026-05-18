import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { OrganisationRepository } from 'src/repositories/organisation.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';

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
        providers: [OrganisationsApiService, OrganisationRepository, OrganisationMembershipRepository],
        controllers: [OrganisationsApiController],
        exports: [OrganisationsApiService, OrganisationRepository, OrganisationMembershipRepository],
      };
    }
    return this.instance;
  }
}
