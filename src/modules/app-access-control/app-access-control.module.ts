import { DynamicModule, Module } from '@nestjs/common';
import { UserRepository } from 'src/repositories/user.repository';

import { AppAccessControlService } from './app-access-control.service';

@Module({})
export class AppAccessControlModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: AppAccessControlModule,
        imports: [],
        providers: [AppAccessControlService, UserRepository],
        exports: [AppAccessControlService],
      };
    }
    return this.instance;
  }
}
