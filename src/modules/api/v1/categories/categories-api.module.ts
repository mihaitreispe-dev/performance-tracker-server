import { DynamicModule, Module } from '@nestjs/common';
import { CategoryRepository } from 'src/repositories/category.repository';

import { CategoriesApiController } from './categories-api.controller';
import { CategoriesApiService } from './categories-api.service';

@Module({})
export class CategoriesApiModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: CategoriesApiModule,
        providers: [CategoriesApiService, CategoryRepository],
        controllers: [CategoriesApiController],
      };
    }
    return this.instance;
  }
}
