import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { bootstrap as bootstrapApiV1 } from 'src/apps/api/v1/api-v1.app.module';
import { bootstrap as bootstrapCron } from 'src/apps/cron/cron.app.module';
import { BootstrapConfigModule } from 'src/modules/config/bootstrap-config.module';
import { BootstrapConfigService } from 'src/modules/config/bootstrap-config.service';

const logger = new Logger('MAIN');

async function bootstrap() {
  const configModule = await NestFactory.createApplicationContext(BootstrapConfigModule.register(), {
    logger: ['error'], // to be override in separate bootstraps
  });
  const configService = configModule.get(BootstrapConfigService);

  if (configService.apiV1ModuleEnabled) {
    await bootstrapApiV1({ port: configService.apiV1Port });
  }
  if (configService.cronModuleEnabled) {
    await bootstrapCron();
  }
}
bootstrap().catch((error) => logger.error(error, error.stack));
