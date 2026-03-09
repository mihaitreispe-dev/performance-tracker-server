import { Module, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { validationErrorFactory } from 'src/lib/errors/validation-error';
import { AllExceptionsFilter } from 'src/lib/http/filters/all-exceptions-filter';
import { LoggingInterceptor } from 'src/lib/http/interceptors/logging.interceptor';
import { AuthModule } from 'src/modules/auth/auth.module';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { UserRepository } from 'src/repositories/user.repository';

import { AdvancedMetricsApiModule } from './advanced-metrics/advanced-metrics-api.module';
import { AnalyticsApiModule } from './analytics/analytics-api.module';
import { AuthApiModule } from './auth/auth-api.module';
import { CardioCategoriesApiModule } from './cardio-categories/cardio-categories-api.module';
import { CoachingApiModule } from './coaching/coaching-api.module';
import { DataExportApiModule } from './data-export/data-export.module';
import { DataImportApiModule } from './data-import/data-import.module';
import { ExercisesApiModule } from './exercises/exercises-api.module';
import { HealthApiModule } from './health/health-api.module';
import { HookApiModule } from './hook/hook-api.module';
import { IndexApiModule } from './index/index-api.module';
import { IntegrationsApiModule } from './integrations/integrations-api.module';
import { NotificationsApiModule } from './notifications/notifications-api.module';
import { PainLogsApiModule } from './pain-logs/pain-logs-api.module';
import { PersonalRecordsApiModule } from './personal-records/personal-records-api.module';
import { RecoveryJournalModule } from './recovery-journal/recovery-journal.module';
import { SleepApiModule } from './sleep/sleep-api.module';
import { VoiceApiModule } from './voice/voice.module';
import { WearablesApiModule } from './wearables/wearables-api.module';
import { WorkoutExecutionsApiModule } from './workout-executions/workout-executions-api.module';
import { WorkoutFileImportsApiModule } from './workout-file-imports/workout-file-imports-api.module';
import { WorkoutPlansApiModule } from './workout-plans/workout-plans-api.module';
import { WorkoutSchedulesApiModule } from './workout-schedules/workout-schedules-api.module';
import { WorkoutsApiModule } from './workouts/workouts-api.module';

@Module({
  imports: [
    HealthApiModule.register(),
    HookApiModule.register(),
    IndexApiModule.register(),
    AuthModule.register(),
    AuthApiModule.register(),
    ExercisesApiModule.register(),
    WorkoutsApiModule.register(),
    WorkoutSchedulesApiModule.register(),
    WorkoutExecutionsApiModule.register(),
    WorkoutFileImportsApiModule.register(),
    CardioCategoriesApiModule.register(),
    AnalyticsApiModule.register(),
    AdvancedMetricsApiModule.register(),
    IntegrationsApiModule.register(),
    WorkoutPlansApiModule.register(),
    PersonalRecordsApiModule.register(),
    SleepApiModule.register(),
    PainLogsApiModule.register(),
    VoiceApiModule.register(),
    WearablesApiModule.register(),
    DataImportApiModule.register(),
    DataExportApiModule.register(),
    CoachingApiModule.register(),
    NotificationsApiModule.register(),
    RecoveryJournalModule.register(),
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
