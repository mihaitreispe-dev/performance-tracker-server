import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { RootLogger } from 'src/lib/log/RootLogger';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { CronModule } from 'src/modules/cron/cron.module';
import { DatabaseModule } from 'src/modules/database/database.module';

@Module({
  imports: [AppConfigModule.forRoot(), DatabaseModule.forRoot(), ScheduleModule.forRoot(), CronModule],
})
export class CronAppModule {}

export async function bootstrap() {
  const app = await NestFactory.createApplicationContext(CronAppModule, {
    logger: new RootLogger({ prefix: 'CRON', logLevels: ['debug', 'error', 'log', 'verbose', 'warn'] }),
  });
  await app.init();
}
