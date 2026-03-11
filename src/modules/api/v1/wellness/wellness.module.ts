import { DynamicModule, Module } from '@nestjs/common';
import { IllnessLogRepository } from 'src/repositories/illness-log.repository';
import { QuickWellnessCheckinRepository } from 'src/repositories/quick-wellness-checkin.repository';

import { WellnessController } from './wellness.controller';
import { WellnessService } from './wellness.service';

@Module({})
export class WellnessModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: WellnessModule,
        providers: [WellnessService, QuickWellnessCheckinRepository, IllnessLogRepository],
        controllers: [WellnessController],
        exports: [WellnessService],
      };
    }
    return this.instance;
  }
}
