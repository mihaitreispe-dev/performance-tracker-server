import { LoggerService, Module } from '@nestjs/common';
import { repl } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { DatabaseModule } from 'src/modules/database/database.module';
import { ReplModule } from 'src/modules/repl/repl.module';

@Module({
  imports: [
    AppConfigModule.forRoot(),
    DatabaseModule.forRoot(),
    ScheduleModule.forRoot({ cronJobs: false, intervals: false, timeouts: false }),
    ReplModule,
  ],
})
export class ReplAppModule {}

export async function bootstrap(logger: LoggerService) {
  const replServer = await repl(ReplAppModule);
  replServer.setupHistory('.nestjs_repl_history', (error, _repl) => {
    if (error) {
      logger.error(error, error.stack);
    }
  });
}
