import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { OrganisationRepository } from 'src/repositories/organisation.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
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
        providers: [AdminApiService, UserRepository, OrganisationRepository, OrganisationMembershipRepository],
        controllers: [AdminApiController],
      };
    }
    return this.instance;
  }
}
