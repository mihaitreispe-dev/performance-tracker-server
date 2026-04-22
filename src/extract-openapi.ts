/**
 * Writes the OpenAPI spec to dist/openapi.json without starting the HTTP server.
 *
 * Usage:
 *   pnpm openapi:extract
 *
 * The script still goes through the full module init (so FirebaseService,
 * DatabaseModule, etc. spin up). It does NOT connect to the DB (pg creates
 * its pool lazily) but Firebase validates its PEM key on init — a valid-format
 * key must be present in .env. See TYPE_SYNC.md / docs on CI secrets for
 * what's needed in the non-local env.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { VersioningType } from '@nestjs/common';

import { ApiV1AppModule } from './apps/api/v1/api-v1.app.module';

async function main() {
  const outputPath = resolve(process.cwd(), 'openapi/openapi.json');

  const app = await NestFactory.create(ApiV1AppModule, {
    logger: ['error', 'warn'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: ['1'] });

  const builder = new DocumentBuilder()
    .setTitle('Younison API Specification')
    .setDescription('Younison API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT');
  // Use `<Controller>_<method>` so operation ids are globally unique —
  // many controllers share methods like `list`/`create`/`getById`, and the
  // runtime factory (method-only) causes collisions when fed into
  // openapi-typescript on the client side.
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
