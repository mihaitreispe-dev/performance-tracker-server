import { bootstrap } from 'src/apps/cli/cli.app.module';

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
