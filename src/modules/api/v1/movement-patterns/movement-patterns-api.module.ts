import { DynamicModule, Module } from '@nestjs/common';
import { MovementPatternRepository } from 'src/repositories/movement-pattern.repository';

import { MovementPatternsApiController } from './movement-patterns-api.controller';
import { MovementPatternsApiService } from './movement-patterns-api.service';

@Module({})
export class MovementPatternsApiModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: MovementPatternsApiModule,
        providers: [MovementPatternsApiService, MovementPatternRepository],
        controllers: [MovementPatternsApiController],
      };
    }
    return this.instance;
  }
}
