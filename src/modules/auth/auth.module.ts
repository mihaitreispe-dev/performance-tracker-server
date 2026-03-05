import { DynamicModule, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { AuthService } from 'src/modules/auth/services/auth.service';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { AuthorizationService } from './policies/authorization.service';

@Module({})
export class AuthModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: AuthModule,
        imports: [AppConfigModule.register(), JwtModule.register({})],
        providers: [
          AuthService,
          AuthorizationService,
          CoachAthleteRelationshipRepository,
          AthletePrivacySettingsRepository,
        ],
        exports: [AuthService, AuthorizationService],
      };
    }
    return this.instance;
  }
}
