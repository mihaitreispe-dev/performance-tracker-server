import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { EntitlementsService } from 'src/modules/entitlements/entitlements.service';
import { S3Module } from 'src/modules/s3/s3.module';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { CourseRepository } from 'src/repositories/course.repository';
import { ResourceEntitlementsRepository } from 'src/repositories/resource-entitlements.repository';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';

import { ContentItemsApiModule } from '../content-items/content-items-api.module';
import { CoursesApiController } from './courses-api.controller';
import { CoursesApiService } from './courses-api.service';

@Module({})
export class CoursesApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: CoursesApiModule,
        imports: [AuthModule.register(), S3Module.register(), ContentItemsApiModule.register()],
        providers: [
          CoursesApiService,
          CourseRepository,
          ContentItemRepository,
          // Lock-status stamping (mirrors the workouts/snacks pattern) — the
          // EntitlementsService + its resource repos resolve per-caller gating.
          EntitlementsService,
          ResourceEntitlementsRepository,
          StripeBillingRepository,
          WorkoutRepository,
        ],
        controllers: [CoursesApiController],
        exports: [CoursesApiService, CourseRepository],
      };
    }
    return this.instance;
  }
}
