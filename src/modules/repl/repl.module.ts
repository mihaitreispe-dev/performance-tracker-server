import { Module } from '@nestjs/common';
import { ApiV1Module } from 'src/modules/api/v1/api-v1.module';
import { CronModule } from 'src/modules/cron/cron.module';

import { ReplUtilService } from './util/repl-util.service';

@Module({
  imports: [ApiV1Module, CronModule],
  providers: [ReplUtilService],
})
export class ReplModule {}
