import { DynamicModule, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from 'src/modules/auth/services/auth.service';
import { AppConfigModule } from 'src/modules/config/app-config.module';

@Module({})
export class AuthModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: AuthModule,
        imports: [AppConfigModule.register(), JwtModule.register({})],
        providers: [AuthService],
        exports: [AuthService],
      };
    }
    return this.instance;
  }
}
