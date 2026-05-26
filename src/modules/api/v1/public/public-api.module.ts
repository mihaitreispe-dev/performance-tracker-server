import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { FirebaseModule } from 'src/modules/firebase/firebase.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { StripeModule } from 'src/modules/stripe/stripe.module';
import { AthleteProfileMetricsRepository } from 'src/repositories/athlete-profile-metrics.repository';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { EntitlementsService } from 'src/modules/entitlements/entitlements.service';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { ResourceEntitlementsRepository } from 'src/repositories/resource-entitlements.repository';
import { CourseRepository } from 'src/repositories/course.repository';
import { DailyNutritionSummaryRepository } from 'src/repositories/daily-nutrition-summary.repository';
import { ExecutionWeatherRepository } from 'src/repositories/execution-weather.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { ModuleRepository } from 'src/repositories/module.repository';
import { OAuthAuthorizationCodeRepository } from 'src/repositories/oauth-authorization-code.repository';
import { OnboardingQuestionnaireRepository } from 'src/repositories/onboarding-questionnaire.repository';
import { OnboardingResponseRepository } from 'src/repositories/onboarding-response.repository';
import { OrganisationApiKeyRepository } from 'src/repositories/organisation-api-key.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { PainLogRepository } from 'src/repositories/pain-log.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { QuickWellnessCheckinRepository } from 'src/repositories/quick-wellness-checkin.repository';
import { RecoveryJournalRepository } from 'src/repositories/recovery-journal.repository';
import { RefreshTokenRepository } from 'src/repositories/refresh-token.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';
import { UserNutritionGoalsRepository } from 'src/repositories/user-nutrition-goals.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { ClientProvisioningService } from '../organisations/client-profiles/client-provisioning.service';
import { PublicAthletesController } from './athletes/public-athletes.controller';
import { PublicBillingController } from './billing/public-billing.controller';
import { PublicBillingService } from './billing/public-billing.service';
import { PublicCardioController } from './cardio/public-cardio.controller';
import { PublicCardioService } from './cardio/public-cardio.service';
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
import { PublicWellnessController } from './wellness/public-wellness.controller';
import { PublicWellnessService } from './wellness/public-wellness.service';

@Module({})
export class PublicApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: PublicApiModule,
        imports: [S3Module.register(), AuthModule.register(), FirebaseModule.register(), StripeModule.register()],
        providers: [
          PublicApiService,
          // Shared with the admin entitlements module — registering it
          // here keeps the public surface independent and matches the
          // dep pattern of the other shared services (PublicBilling vs
          // BillingApi both register StripeBillingRepository).
          EntitlementsService,
          ResourceEntitlementsRepository,
          PublicClientsService,
          PublicQuestionnairesService,
          PublicOAuthService,
          PublicAthletesService,
          PublicWellnessService,
          PublicCardioService,
          PublicBillingService,
          ClientProvisioningService,
          ModuleRepository,
          StripeBillingRepository,
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
          AthleteProfileMetricsRepository,
          SleepLogRepository,
          PainLogRepository,
          RecoveryJournalRepository,
          QuickWellnessCheckinRepository,
          DailyNutritionSummaryRepository,
          UserNutritionGoalsRepository,
          WorkoutRouteRepository,
          CardioMetricsRepository,
          ExecutionWeatherRepository,
        ],
        controllers: [
          PublicApiController,
          PublicClientsController,
          PublicQuestionnairesController,
          PublicOAuthController,
          PublicAthletesController,
          PublicWellnessController,
          PublicCardioController,
          PublicBillingController,
        ],
      };
    }
    return this.instance;
  }
}
