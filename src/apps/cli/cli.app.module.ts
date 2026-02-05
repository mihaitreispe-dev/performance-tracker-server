import { Module } from '@nestjs/common';
import { BootstrapConsole } from 'nestjs-console';
import { RootLogger } from 'src/lib/log/RootLogger';
import { CliModule } from 'src/modules/cli/cli.module';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { DatabaseModule } from 'src/modules/database/database.module';

@Module({
  imports: [AppConfigModule.forRoot(), DatabaseModule.forRoot(), CliModule],
})
export class CliAppModule {}

export async function bootstrap() {
  const console = new BootstrapConsole({
    module: CliAppModule,
    useDecorators: true,
    contextOptions: {
      logger: new RootLogger({
        prefix: 'CLI',
        logLevels: process.env.LOGALL ? ['debug', 'error', 'log', 'verbose', 'warn', 'fatal'] : ['error', 'fatal'],
      }),
    },
  });
  const app = await console.init();
  app.useLogger(new RootLogger({ prefix: 'CLI', logLevels: ['debug', 'error', 'log', 'verbose', 'warn', 'fatal'] }));
  await app.init();
  try {
    await console.boot();
    await app.close();
  } catch (error) {
    await app.close();
    throw error;
  }
}
