import { DynamicModule, Module } from '@nestjs/common';
import { CardioCategoryRepository } from 'src/repositories/cardio-category.repository';

import { CardioCategoriesApiController } from './cardio-categories-api.controller';
import { CardioCategoriesApiService } from './cardio-categories-api.service';

@Module({})
export class CardioCategoriesApiModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: CardioCategoriesApiModule,
        providers: [CardioCategoriesApiService, CardioCategoryRepository],
        controllers: [CardioCategoriesApiController],
      };
    }
    return this.instance;
  }
}
