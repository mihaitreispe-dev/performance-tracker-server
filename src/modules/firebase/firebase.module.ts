import { HttpModule } from '@nestjs/axios';
import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';

import { FirebaseService } from './firebase.service';

@Module({})
export class FirebaseModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: FirebaseModule,
        imports: [AppConfigModule.register(), HttpModule],
        providers: [FirebaseService],
        exports: [FirebaseService],
      };
    }
    return this.instance;
  }
}
