import { DynamicModule, Module } from '@nestjs/common';
import { ConsoleModule } from 'nestjs-console';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';

import { SetDefaultSharingService } from './set-default-sharing.service';

@Module({})
export class SetDefaultSharingModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: SetDefaultSharingModule,
        imports: [ConsoleModule],
        providers: [SetDefaultSharingService, CoachAthleteRelationshipRepository, AthletePrivacySettingsRepository],
        exports: [SetDefaultSharingService],
      };
    }
    return this.instance;
  }
}
