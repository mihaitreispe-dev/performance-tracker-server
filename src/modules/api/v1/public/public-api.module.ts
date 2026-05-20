import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { FirebaseModule } from 'src/modules/firebase/firebase.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { CourseRepository } from 'src/repositories/course.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { OAuthAuthorizationCodeRepository } from 'src/repositories/oauth-authorization-code.repository';
import { OnboardingQuestionnaireRepository } from 'src/repositories/onboarding-questionnaire.repository';
import { OnboardingResponseRepository } from 'src/repositories/onboarding-response.repository';
import { OrganisationApiKeyRepository } from 'src/repositories/organisation-api-key.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { RefreshTokenRepository } from 'src/repositories/refresh-token.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { PublicAthletesController } from './athletes/public-athletes.controller';
import { PublicAthletesService } from './athletes/public-athletes.service';
import { PublicOAuthController } from './auth/public-oauth.controller';
import { PublicOAuthService } from './auth/public-oauth.service';
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
        imports: [S3Module.register(), AuthModule.register(), FirebaseModule.register()],
        providers: [
          PublicApiService,
          PublicClientsService,
          PublicQuestionnairesService,
          PublicOAuthService,
          PublicAthletesService,
          WorkoutGeneratorService,
          WorkoutRepository,
          WorkoutScheduleRepository,
          WorkoutExecutionRepository,
          SetCompletionRepository,
          PersonalRecordRepository,
          CourseRepository,
          ContentItemRepository,
          ExerciseRepository,
          ExerciseInstanceRepository,
          OnboardingQuestionnaireRepository,
          OnboardingResponseRepository,
          OrganisationMembershipRepository,
          OrganisationApiKeyRepository,
          OAuthAuthorizationCodeRepository,
          RefreshTokenRepository,
          UserRepository,
        ],
        controllers: [
          PublicApiController,
          PublicClientsController,
          PublicQuestionnairesController,
          PublicOAuthController,
          PublicAthletesController,
        ],
      };
    }
    return this.instance;
  }
}
