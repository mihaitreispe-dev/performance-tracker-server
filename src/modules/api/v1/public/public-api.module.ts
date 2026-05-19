import { DynamicModule, Module } from '@nestjs/common';
import { S3Module } from 'src/modules/s3/s3.module';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { CourseRepository } from 'src/repositories/course.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';

import { PublicClientsController } from './clients/public-clients.controller';
import { PublicClientsService } from './clients/public-clients.service';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';

@Module({})
export class PublicApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: PublicApiModule,
        imports: [S3Module.register()],
        providers: [
          PublicApiService,
          PublicClientsService,
          WorkoutRepository,
          CourseRepository,
          ContentItemRepository,
          ExerciseRepository,
          OrganisationMembershipRepository,
          UserRepository,
        ],
        controllers: [PublicApiController, PublicClientsController],
      };
    }
    return this.instance;
  }
}
