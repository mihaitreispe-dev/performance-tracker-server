import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { FirebaseModule } from 'src/modules/firebase/firebase.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { RefreshTokenRepository } from 'src/repositories/refresh-token.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { UserSettingsRepository } from 'src/repositories/user-settings.repository';

import { AuthApiController } from './auth-api.controller';
import { AuthApiService } from './auth-api.service';

@Module({})
export class AuthApiModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: AuthApiModule,
        imports: [AuthModule.register(), FirebaseModule.register(), S3Module.register(), AppConfigModule.register()],
        providers: [AuthApiService, UserRepository, RefreshTokenRepository, UserSettingsRepository],
        controllers: [AuthApiController],
      };
    }
    return this.instance;
  }
}
