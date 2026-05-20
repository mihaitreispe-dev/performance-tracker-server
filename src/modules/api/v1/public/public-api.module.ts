import { DynamicModule, Module } from '@nestjs/common';
import { S3Module } from 'src/modules/s3/s3.module';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { CourseRepository } from 'src/repositories/course.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { OnboardingQuestionnaireRepository } from 'src/repositories/onboarding-questionnaire.repository';
import { OnboardingResponseRepository } from 'src/repositories/onboarding-response.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';

import { PublicClientsController } from './clients/public-clients.controller';
import { PublicClientsService } from './clients/public-clients.service';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';
import { PublicQuestionnairesController } from './questionnaires/public-questionnaires.controller';
import { PublicQuestionnairesService } from './questionnaires/public-questionnaires.service';
import { WorkoutGeneratorService } from './questionnaires/workout-generator';

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
          PublicQuestionnairesService,
          WorkoutGeneratorService,
          WorkoutRepository,
          CourseRepository,
          ContentItemRepository,
          ExerciseRepository,
          OnboardingQuestionnaireRepository,
          OnboardingResponseRepository,
          OrganisationMembershipRepository,
          UserRepository,
        ],
        controllers: [
          PublicApiController,
          PublicClientsController,
          PublicQuestionnairesController,
        ],
      };
    }
    return this.instance;
  }
}
