import { DynamicModule, Module } from '@nestjs/common';
import { HrvBaselineRepository } from 'src/repositories/hrv-baseline.repository';
import { RecoveryJournalRepository } from 'src/repositories/recovery-journal.repository';

import { RecoveryJournalController } from './recovery-journal.controller';
import { RecoveryJournalService } from './recovery-journal.service';

@Module({})
export class RecoveryJournalModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: RecoveryJournalModule,
        providers: [RecoveryJournalService, RecoveryJournalRepository, HrvBaselineRepository],
        controllers: [RecoveryJournalController],
        exports: [RecoveryJournalService],
      };
    }
    return this.instance;
  }
}
