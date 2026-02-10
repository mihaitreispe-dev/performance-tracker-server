import { Module, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { validationErrorFactory } from 'src/lib/errors/validation-error';
import { AllExceptionsFilter } from 'src/lib/http/filters/all-exceptions-filter';
import { LoggingInterceptor } from 'src/lib/http/interceptors/logging.interceptor';
import { AuthModule } from 'src/modules/auth/auth.module';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

import { AuthApiModule } from './auth/auth-api.module';
import { CardioCategoriesApiModule } from './cardio-categories/cardio-categories-api.module';
import { ExercisesApiModule } from './exercises/exercises-api.module';
import { HealthApiModule } from './health/health-api.module';
import { HookApiModule } from './hook/hook-api.module';
import { IndexApiModule } from './index/index-api.module';
import { WorkoutsApiModule } from './workouts/workouts-api.module';
import { WorkoutSchedulesApiModule } from './workout-schedules/workout-schedules-api.module';

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
    CardioCategoriesApiModule.register(),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
    JwtAuthGuard,
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
