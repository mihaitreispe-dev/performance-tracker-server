import { DynamicModule, Module } from '@nestjs/common';
import { ConsoleModule } from 'nestjs-console';
import { FoodRepository } from 'src/repositories/food.repository';

import { ImportFoodsService } from './import-foods.service';

@Module({})
export class ImportFoodsModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: ImportFoodsModule,
        imports: [ConsoleModule],
        providers: [ImportFoodsService, FoodRepository],
        exports: [ImportFoodsService],
      };
    }
    return this.instance;
  }
}
