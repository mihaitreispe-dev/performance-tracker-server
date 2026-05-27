/**
 * Local stand-in for AWS MediaConvert. Transcodes an exercise's already-
 * uploaded source clip with ffmpeg and writes the outputs to MinIO at the
 * EXACT keys production MediaConvert would (see s3Keys.content.exercise), then
 * flips the row to `assets_done`. The app's buildMediaAssets then resolves the
 * HLS/poster/thumbnail URLs unchanged — so the player, dual-aspect rendition
 * selection, etc. all work locally with no AWS.
 *
 * Produces, per exercise, mirroring the real pipeline:
 *   9:16 portrait : video.m3u8 (+ segments), video_audio.mp4,
 *                   video_poster.0000000.jpg, video_thumbnail.0000000.jpg
 *   16:9 wide     : wide/video.m3u8 (+ segments),
 *                   wide/video_poster.0000000.jpg, wide/video_thumbnail.0000000.jpg
 *
 * Smart crop (Rekognition) has no local equivalent — `--wide-mode` picks how
 * the cross-orientation frame is filled instead:
 *   pad  (default) : letterbox, matches the server's no-crop behaviour
 *   crop           : centre-crop to fill, approximates a smart-crop result
 *
 * Local-dev only. Run with:
 *
 *   pnpm exec ts-node -r tsconfig-paths/register \
 *     src/scripts/local-transcode-exercise.ts (--id=<exerciseId> | --all) \
 *     [--wide-mode=pad|crop] [--limit=N]
 *
 * Prerequisites:
 *   - ffmpeg on PATH
 *   - MinIO + Postgres reachable per .env (S3_ENDPOINT, AWS_*, DB_*)
 *   - the content bucket must be public-read (the minio-init service handles
 *     this) so the unsigned HLS segment GETs the player issues succeed
 */
import 'reflect-metadata';
import 'dotenv/config';

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

import type { Database } from '../database/interfaces';
import { s3Keys } from '../lib/util/s3-keys';

const CONTENT_BUCKET = process.env.S3_CONTENT_BUCKET ?? 'content';

type WideMode = 'pad' | 'crop';

interface ExerciseRow {
  id: string;
  name: string;
  user_id: string;
  video_s3_bucket: string | null;
  video_s3_key: string | null;
}

/** ffmpeg video filter that fits the source into WxH, then either letterboxes or centre-crops. */
function fitFilter(width: number, height: number, mode: WideMode | 'pad'): string {
  if (mode === 'crop') {
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
}

async function transcodeOrientation(opts: {
  sourcePath: string;
  outDir: string;
  width: number;
  height: number;
  mode: WideMode | 'pad';
}): Promise<void> {
  await mkdir(opts.outDir, { recursive: true });
  await runFfmpeg([
    '-y',
    '-i',
    opts.sourcePath,
    '-vf',
    fitFilter(opts.width, opts.height, opts.mode),
    '-c:v',
    'libx264',
    '-profile:v',
    'main',
    '-pix_fmt',
    'yuv420p',
    '-an', // HLS variant here is video-only; audio ships as a separate track
    '-start_number',
    '0',
    '-hls_time',
    '6',
    '-hls_list_size',
    '0',
    '-hls_segment_filename',
    join(opts.outDir, 'segment%d.ts'),
    '-f',
    'hls',
    join(opts.outDir, 'video.m3u8'),
  ]);
}

async function extractStill(sourcePath: string, outPath: string, width: number, height: number): Promise<void> {
  await runFfmpeg([
    '-y',
    '-i',
    sourcePath,
    '-frames:v',
    '1',
    '-vf',
    fitFilter(width, height, 'pad'),
    '-q:v',
    '2',
    outPath,
  ]);
}

async function uploadHlsDir(s3: S3Client, localDir: string, keyPrefix: string): Promise<void> {
  await putFile(s3, `${keyPrefix}/video.m3u8`, join(localDir, 'video.m3u8'), 'application/vnd.apple.mpegurl');
  const segments = (await readdir(localDir)).filter((f) => f.endsWith('.ts'));
  for (const seg of segments) {
    await putFile(s3, `${keyPrefix}/${seg}`, join(localDir, seg), 'video/mp2t');
  }
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
    // 1. Pull the source clip from the upload bucket.
    const sourcePath = join(workDir, 'source');
    await downloadObject(s3, exercise.video_s3_bucket, exercise.video_s3_key, sourcePath);

    const paths = s3Keys.content.exercise({ userId: exercise.user_id, exerciseId: exercise.id });
    const base = paths.base; // exercises/<userId>/<exerciseId>
    const wideBase = `${base}/wide`;

    // 2. HLS renditions — 9:16 portrait (letterbox, the source orientation)
    //    and 16:9 wide (pad or centre-crop).
    const portraitDir = join(workDir, 'portrait');
    const wideDir = join(workDir, 'wide');
    await transcodeOrientation({ sourcePath, outDir: portraitDir, width: 720, height: 1280, mode: 'pad' });
    await transcodeOrientation({ sourcePath, outDir: wideDir, width: 1280, height: 720, mode: wideMode });
    await uploadHlsDir(s3, portraitDir, base);
    await uploadHlsDir(s3, wideDir, wideBase);

    // 3. Posters + thumbnails for both orientations.
    const stills: Array<{ key: string; w: number; h: number; file: string }> = [
      { key: paths.poster, w: 720, h: 1280, file: 'poster.jpg' },
      { key: paths.thumbnail, w: 180, h: 320, file: 'thumb.jpg' },
      { key: paths.posterWide, w: 1280, h: 720, file: 'poster_wide.jpg' },
      { key: paths.thumbnailWide, w: 320, h: 180, file: 'thumb_wide.jpg' },
    ];
    for (const still of stills) {
      const localPath = join(workDir, still.file);
      await extractStill(sourcePath, localPath, still.w, still.h);
      await putFile(s3, still.key, localPath, 'image/jpeg');
    }

    // 4. Separate audio track (best-effort — silent demos have none).
    try {
      const audioPath = join(workDir, 'audio.mp4');
      await runFfmpeg(['-y', '-i', sourcePath, '-vn', '-c:a', 'aac', '-b:a', '128k', audioPath]);
      await putFile(s3, paths.audio, audioPath, 'audio/mp4');
    } catch {
      console.warn(`    (no audio track for ${exercise.id} — skipping ${paths.audio})`);
    }

    // 5. Mark done and clear any in-flight job markers.
    await db
      .updateTable('exercises')
      .set({ status: 'assets_done', media_convert_job_id: null, rekognition_job_id: null } as never)
      .where('id', '=', exercise.id)
      .execute();

    console.log(`  ✓ ${exercise.id} (${exercise.name}) — assets_done (wide-mode: ${wideMode})`);
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

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.split('\n').slice(-5).join(' ').slice(0, 300)}`));
    });
  });
}

async function downloadObject(s3: S3Client, bucket: string, key: string, destPath: string): Promise<void> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error(`Empty body for s3://${bucket}/${key}`);
  await pipeline(res.Body as Readable, createWriteStream(destPath));
}

async function putFile(s3: S3Client, key: string, path: string, contentType: string): Promise<void> {
  const body = await readFile(path);
  await s3.send(new PutObjectCommand({ Bucket: CONTENT_BUCKET, Key: key, Body: body, ContentType: contentType }));
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
