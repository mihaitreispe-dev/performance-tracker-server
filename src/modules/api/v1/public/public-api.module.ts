import { DynamicModule, Module } from '@nestjs/common';
import { S3Module } from 'src/modules/s3/s3.module';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { CourseRepository } from 'src/repositories/course.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';

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
          WorkoutRepository,
          CourseRepository,
          ContentItemRepository,
          ExerciseRepository,
        ],
        controllers: [PublicApiController],
      };
    }
    return this.instance;
  }
}
