import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { ModuleRepository } from 'src/repositories/module.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';

import { ModulesApiController } from './modules-api.controller';
import { ModulesApiService } from './modules-api.service';

@Module({})
export class ModulesApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: ModulesApiModule,
        imports: [AuthModule.register()],
        providers: [ModulesApiService, ModuleRepository, OrganisationMembershipRepository],
        controllers: [ModulesApiController],
        exports: [ModulesApiService, ModuleRepository],
      };
    }
    return this.instance;
  }
}
