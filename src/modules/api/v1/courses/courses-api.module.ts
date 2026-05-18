import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { CourseRepository } from 'src/repositories/course.repository';

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
        providers: [CoursesApiService, CourseRepository, ContentItemRepository],
        controllers: [CoursesApiController],
        exports: [CoursesApiService, CourseRepository],
      };
    }
    return this.instance;
  }
}
