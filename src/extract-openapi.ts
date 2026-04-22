/**
 * Writes the OpenAPI spec to openapi/openapi.json without starting the HTTP
 * server.
 *
 * Usage:
 *   pnpm openapi:extract
 *
 * Uses @nestjs/testing to override FirebaseService with a no-op, so the script
 * runs in CI without a real Firebase PEM. Postgres is lazy (pg creates the
 * pool on first query) so the DB doesn't need to be reachable either. Env
 * values are still validated by class-validator via `Env` — stubs are enough.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import { ApiV1AppModule } from './apps/api/v1/api-v1.app.module';
import { FirebaseService } from './modules/firebase/firebase.service';

async function main() {
  const outputPath = resolve(process.cwd(), 'openapi/openapi.json');

  const moduleRef = await Test.createTestingModule({
    imports: [ApiV1AppModule],
  })
    .overrideProvider(FirebaseService)
    .useValue({
      onModuleInit: () => undefined,
      verifyIdToken: () => Promise.resolve(null),
    })
    .compile();

  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: ['1'] });
  await app.init();

  const builder = new DocumentBuilder()
    .setTitle('Younison API Specification')
    .setDescription('Younison API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT');
  // `<Controller>_<method>` keeps operation ids globally unique — many
  // controllers share method names like `list`/`create`/`getById`, and
  // openapi-typescript collides on non-unique ids.
  const document = SwaggerModule.createDocument(app, builder.build(), {
    deepScanRoutes: true,
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey}_${methodKey}`,
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(document, null, 2));

  await app.close();
  process.stdout.write(`Wrote ${outputPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`extract-openapi failed: ${err?.stack ?? err}\n`);
  process.exit(1);
});
