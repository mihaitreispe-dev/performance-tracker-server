/**
 * Local stand-in for AWS MediaConvert, as a standalone backfill script.
 * Transcodes an exercise's already-uploaded source clip with ffmpeg and writes
 * the outputs to MinIO at the EXACT keys production MediaConvert would (see
 * s3Keys.content.exercise), then flips the row to `assets_done`. The app's
 * buildMediaAssets then resolves the HLS/poster/thumbnail URLs unchanged.
 *
 * This shares the ffmpeg pipeline with the automatic, upload-triggered
 * LocalTranscodeService (ENABLE_LOCAL_TRANSCODE) — this script is the manual /
 * bulk equivalent, handy for backfilling exercises that were uploaded before
 * the flag was on, and it runs without a live server.
 *
 * Local-dev only. Run with:
 *
 *   pnpm exec ts-node -r tsconfig-paths/register \
 *     src/scripts/local-transcode-exercise.ts (--id=<exerciseId> | --all) \
 *     [--wide-mode=pad|crop] [--limit=N]
 *
 * Prerequisites: ffmpeg on PATH; MinIO + Postgres reachable per .env; the
 * content bucket must be public-read so the player's unsigned HLS GETs work.
 */
import 'reflect-metadata';
import 'dotenv/config';

import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

import type { Database } from '../database/interfaces';
import { s3Keys } from '../lib/util/s3-keys';
import { transcodeExerciseSource, type WideMode } from '../modules/local-transcode/ffmpeg-pipeline';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const CONTENT_BUCKET = process.env.S3_CONTENT_BUCKET ?? 'content';

interface ExerciseRow {
  id: string;
  name: string;
  user_id: string;
  video_s3_bucket: string | null;
  video_s3_key: string | null;
}

async function transcodeExercise(
  s3: S3Client,
  db: Kysely<Database>,
  exercise: ExerciseRow,
  wideMode: WideMode,
): Promise<void> {
  if (!exercise.video_s3_bucket || !exercise.video_s3_key) {
    console.warn(`  ✗ ${exercise.id} (${exercise.name}) — no source video; skipping`);
    return;
  }

  const workDir = join(tmpdir(), `xcode-${exercise.id}`);
  await mkdir(workDir, { recursive: true });
  try {
    const sourcePath = join(workDir, 'source');
    await downloadObject(s3, exercise.video_s3_bucket, exercise.video_s3_key, sourcePath);

    const artifacts = await transcodeExerciseSource({ sourcePath, workDir, wideMode });
    const paths = s3Keys.content.exercise({ userId: exercise.user_id, exerciseId: exercise.id });

    for (const artifact of artifacts) {
      const body = await readFile(artifact.localPath);
      await s3.send(
        new PutObjectCommand({
          Bucket: CONTENT_BUCKET,
          Key: `${paths.base}/${artifact.relKey}`,
          Body: body,
          ContentType: artifact.contentType,
        }),
      );
    }

    await db
      .updateTable('exercises')
      .set({ status: 'assets_done', media_convert_job_id: null, rekognition_job_id: null } as never)
      .where('id', '=', exercise.id)
      .execute();

    console.log(`  ✓ ${exercise.id} (${exercise.name}) — assets_done (${artifacts.length} artifacts, wide-mode: ${wideMode})`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const wideMode: WideMode = args['wide-mode'] === 'crop' ? 'crop' : 'pad';
  const limit = args.limit ? Number.parseInt(args.limit, 10) : Number.POSITIVE_INFINITY;

  if (!args.id && args.all === undefined) {
    fail('Pass --id=<exerciseId> for one exercise, or --all to transcode every exercise with a source video.');
  }

  const db = openDb();
  const s3 = openS3();
  try {
    let query = db
      .selectFrom('exercises')
      .select(['id', 'name', 'user_id', 'video_s3_bucket', 'video_s3_key'])
      .where('video_s3_key', 'is not', null);
    query = args.id ? query.where('id', '=', args.id) : query;
    const exercises = (await query.execute()) as ExerciseRow[];

    if (exercises.length === 0) {
      console.log('No matching exercises with a source video found.');
      return;
    }
    console.log(`Transcoding ${Math.min(exercises.length, limit)} of ${exercises.length} exercise(s) locally…`);

    let done = 0;
    for (const exercise of exercises) {
      if (done >= limit) break;
      await transcodeExercise(s3, db, exercise, wideMode);
      done += 1;
    }
    console.log(`\nDone. Transcoded ${done} exercise(s).`);
  } finally {
    await db.destroy();
  }
}

// ---------- helpers ----------

async function downloadObject(s3: S3Client, bucket: string, key: string, destPath: string): Promise<void> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error(`Empty body for s3://${bucket}/${key}`);
  await pipeline(res.Body as Readable, createWriteStream(destPath));
}

function openDb(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT ? Number.parseInt(process.env.DB_PORT, 10) : undefined,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        ssl: process.env.DB_SSL === 'Y' ? { rejectUnauthorized: false } : false,
      }),
    }),
  });
}

function openS3(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY!,
      secretAccessKey: process.env.AWS_SECRET_KEY!,
    },
    forcePathStyle: !!process.env.S3_ENDPOINT,
  });
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    if (arg === '--all') {
      out.all = '';
      continue;
    }
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function fail(message: string): never {
  console.error(`[local-transcode] ${message}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
