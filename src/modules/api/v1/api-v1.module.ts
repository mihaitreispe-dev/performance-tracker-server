import { Module, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { validationErrorFactory } from 'src/lib/errors/validation-error';
import { AllExceptionsFilter } from 'src/lib/http/filters/all-exceptions-filter';
import { LoggingInterceptor } from 'src/lib/http/interceptors/logging.interceptor';
import { AuthModule } from 'src/modules/auth/auth.module';
import { ApiKeyAuthGuard, ApiKeyUsageInterceptor } from 'src/modules/auth/api-key';
import { ActiveOrgGuard } from 'src/modules/auth/guards/active-org.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { OrganisationApiKeyRepository } from 'src/repositories/organisation-api-key.repository';
import { OrganisationApiUsageRepository } from 'src/repositories/organisation-api-usage.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { AdminApiModule } from './admin/admin-api.module';
import { AdvancedMetricsApiModule } from './advanced-metrics/advanced-metrics-api.module';
import { AnalyticsApiModule } from './analytics/analytics-api.module';
import { WorkoutComparisonModule } from './analytics/workout-comparison/workout-comparison.module';
import { AuthApiModule } from './auth/auth-api.module';
import { CardioCategoriesApiModule } from './cardio-categories/cardio-categories-api.module';
import { CoachingApiModule } from './coaching/coaching-api.module';
import { ContentItemsApiModule } from './content-items/content-items-api.module';
import { CoursesApiModule } from './courses/courses-api.module';
import { DataExportApiModule } from './data-export/data-export.module';
import { DataImportApiModule } from './data-import/data-import.module';
import { EquipmentApiModule } from './equipment/equipment-api.module';
import { ExercisesApiModule } from './exercises/exercises-api.module';
import { ExploreApiModule } from './explore/explore-api.module';
import { HealthApiModule } from './health/health-api.module';
import { InlineImagesApiModule } from './inline-images/inline-images-api.module';
import { HookApiModule } from './hook/hook-api.module';
import { IndexApiModule } from './index/index-api.module';
import { IntegrationsApiModule } from './integrations/integrations-api.module';
import { MeApiModule } from './me/me-api.module';
import { ModulesApiModule } from './modules/modules-api.module';
import { NotificationRulesApiModule } from './notification-rules/notification-rules-api.module';
import { NotificationsApiModule } from './notifications/notifications-api.module';
import { NutritionApiModule } from './nutrition/nutrition-api.module';
import { OrganisationsApiModule } from './organisations/organisations-api.module';
import { PainLogsApiModule } from './pain-logs/pain-logs-api.module';
import { PersonalRecordsApiModule } from './personal-records/personal-records-api.module';
import { PlayerTelemetryApiModule } from './player-telemetry/player-telemetry-api.module';
import { OutboundSyncApiModule } from './outbound-sync/outbound-sync-api.module';
import { PublicApiModule } from './public/public-api.module';
import { RaceCalendarApiModule } from './race-calendar/race-calendar-api.module';
import { RacePredictionApiModule } from './race-prediction/race-prediction-api.module';
import { RecoveryJournalModule } from './recovery-journal/recovery-journal.module';
import { SleepApiModule } from './sleep/sleep-api.module';
import { WearablesApiModule } from './wearables/wearables-api.module';
import { WellnessModule } from './wellness/wellness.module';
import { WorkoutExecutionsApiModule } from './workout-executions/workout-executions-api.module';
import { WorkoutFileImportsApiModule } from './workout-file-imports/workout-file-imports-api.module';
import { WorkoutPlansApiModule } from './workout-plans/workout-plans-api.module';
import { WorkoutSchedulesApiModule } from './workout-schedules/workout-schedules-api.module';
import { WorkoutsApiModule } from './workouts/workouts-api.module';
import { StripeWebhookModule } from './webhooks/stripe/stripe-webhook.module';

@Module({
  imports: [
    HealthApiModule.register(),
    InlineImagesApiModule.register(),
    HookApiModule.register(),
    IndexApiModule.register(),
    AuthModule.register(),
    AuthApiModule.register(),
    ExercisesApiModule.register(),
    EquipmentApiModule.register(),
    WorkoutsApiModule.register(),
    WorkoutSchedulesApiModule.register(),
    WorkoutExecutionsApiModule.register(),
    WorkoutFileImportsApiModule.register(),
    CardioCategoriesApiModule.register(),
    AnalyticsApiModule.register(),
    WorkoutComparisonModule.register(),
    AdvancedMetricsApiModule.register(),
    AdminApiModule.register(),
    IntegrationsApiModule.register(),
    WorkoutPlansApiModule.register(),
    PersonalRecordsApiModule.register(),
    PlayerTelemetryApiModule.register(),
    OutboundSyncApiModule.register(),
    SleepApiModule.register(),
    PainLogsApiModule.register(),
    WearablesApiModule.register(),
    DataImportApiModule.register(),
    DataExportApiModule.register(),
    ExploreApiModule.register(),
    CoachingApiModule.register(),
    NotificationsApiModule.register(),
    RecoveryJournalModule.register(),
    WellnessModule.register(),
    RaceCalendarApiModule.register(),
    RacePredictionApiModule.register(),
    NutritionApiModule.register(),
    OrganisationsApiModule.register(),
    MeApiModule.register(),
    ModulesApiModule.register(),
    NotificationRulesApiModule.register(),
    ContentItemsApiModule.register(),
    CoursesApiModule.register(),
    PublicApiModule.register(),
    StripeWebhookModule.register(),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
    JwtAuthGuard,
    {
      provide: APP_GUARD,
      useExisting: RolesGuard,
    },
    RolesGuard,
    {
      provide: APP_GUARD,
      useExisting: ActiveOrgGuard,
    },
    ActiveOrgGuard,
    {
      provide: APP_GUARD,
      useExisting: ApiKeyAuthGuard,
    },
    ApiKeyAuthGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiKeyUsageInterceptor,
    },
    OrganisationApiKeyRepository,
    OrganisationApiUsageRepository,
    OrganisationMembershipRepository,
    UserRepository,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        always: true,
        transform: true,
        exceptionFactory: (errors) => new UnprocessableEntityException(validationErrorFactory(errors)),
      }),
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class ApiV1Module {}
