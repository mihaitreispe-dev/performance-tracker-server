import { DynamicModule, Module } from '@nestjs/common';
import { EquipmentRepository } from 'src/repositories/equipment.repository';

import { EquipmentApiController } from './equipment-api.controller';
import { EquipmentApiService } from './equipment-api.service';

@Module({})
export class EquipmentApiModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: EquipmentApiModule,
        providers: [EquipmentApiService, EquipmentRepository],
        controllers: [EquipmentApiController],
      };
    }
    return this.instance;
  }
}
