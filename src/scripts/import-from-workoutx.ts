/**
 * One-shot ingest of WorkoutX (workoutxapp.com) into the local exercises
 * catalogue. Pulls every exercise, downloads each GIF, transcodes it locally
 * with ffmpeg (GIF → MP4 → HLS playlist + thumbnail), uploads to MinIO at the
 * exact paths production MediaConvert would write, and inserts an exercise
 * row in `status='assets_done'`. The result: lists show thumbnails and the
 * HLS player works in local dev without us needing a real MediaConvert.
 *
 * Local-dev only. Not for production — WorkoutX's free tier is 500 req/mo,
 * and the data licence (which the operator should review before commercial
 * use) likely doesn't permit redistribution.
 *
 * Run with:
 *
 *   WORKOUTX_API_KEY=… pnpm exec ts-node -r tsconfig-paths/register \
 *     src/scripts/import-from-workoutx.ts [--org=ra-demo] [--limit=50]
 *
 * Flags:
 *   --org=<slug>   Target organisation slug. Default: ra-demo.
 *   --limit=<n>    Stop after importing N exercises (handy for smoke tests).
 *
 * Idempotency: skips exercises whose name already exists in the target org,
 * so the script is safe to re-run after a partial failure.
 *
 * Prerequisites:
 *   - ffmpeg on PATH
 *   - WORKOUTX_API_KEY env var
 *   - MinIO + Postgres reachable per the existing .env
 */
import 'reflect-metadata';
import 'dotenv/config';

import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import {
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { OrganisationRole, type Database } from '../database/interfaces';
import { s3Keys } from '../lib/util/s3-keys';

// ---------- args + env ----------

const args = parseArgs(process.argv.slice(2));
const ORG_SLUG = args.org ?? 'ra-demo';
const MAX_EXERCISES = args.limit ? Number.parseInt(args.limit, 10) : Number.POSITIVE_INFINITY;

const WORKOUTX_API_KEY = process.env.WORKOUTX_API_KEY;
if (!WORKOUTX_API_KEY) {
  fail('Missing WORKOUTX_API_KEY env var. Sign up at https://workoutxapp.com and add it to .env.');
}

const WORKOUTX_BASE = 'https://api.workoutxapp.com/v1';
const UPLOAD_BUCKET = process.env.S3_UPLOAD_BUCKET ?? 'uploads';
const CONTENT_BUCKET = process.env.S3_CONTENT_BUCKET ?? 'content';

// ---------- types (shape WorkoutX returns; tolerant of extra fields) ----------

interface WorkoutXExercise {
  id: string;
  name: string;
  bodyPart?: string;
  target?: string;
  equipment?: string;
  secondaryMuscles?: string[];
  instructions?: string[];
  gifUrl?: string;
}

// ---------- main ----------

async function main() {
  const db = openDb();
  const s3 = openS3();

  // Resolve org + content owner. We re-use the system user from the demo seed
  // (the rows it created own the org). If the seed has never run, this fails
  // with a friendly hint.
  const { org, ownerUserId } = await resolveOrg(db, ORG_SLUG);

  // Pre-snapshot existing exercise names so we can skip duplicates cheaply.
  const existing = await db
    .selectFrom('exercises')
    .where('organisation_id', '=', org.id)
    .select('name')
    .execute();
  const seenNames = new Set(existing.map((e) => e.name.toLowerCase()));
  // eslint-disable-next-line no-console
  console.log(`[ingest] Target org "${org.slug}" (${org.id}). ${seenNames.size} exercise(s) already present — will skip duplicates.`);

  let totalSeen = 0;
  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const PAGE_SIZE = 50;

  // WorkoutX exposes offset-based pagination — we keep walking until we get a
  // short page back. Limit is also clamped against MAX_EXERCISES for smoke
  // tests.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    if (inserted >= MAX_EXERCISES) break;
    const page = await fetchPage(offset, PAGE_SIZE);
    if (page.length === 0) break;
    // eslint-disable-next-line no-console
    console.log(`[ingest] Fetched page offset=${offset} (${page.length} rows).`);

    for (const ex of page) {
      if (inserted >= MAX_EXERCISES) break;
      totalSeen += 1;
      if (seenNames.has(ex.name.toLowerCase())) {
        skipped += 1;
        continue;
      }
      try {
        await ingestOne({ db, s3, exercise: ex, organisationId: org.id, ownerUserId });
        seenNames.add(ex.name.toLowerCase());
        inserted += 1;
        if (inserted % 25 === 0) {
          // eslint-disable-next-line no-console
          console.log(`[ingest] ${inserted} inserted, ${skipped} skipped, ${failed} failed.`);
        }
      } catch (err) {
        failed += 1;
        // eslint-disable-next-line no-console
        console.warn(`[ingest] ${ex.name}: ${(err as Error).message}`);
      }
    }

    if (page.length < PAGE_SIZE) break;
  }

  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      '─'.repeat(60),
      'WorkoutX → DB ingest complete.',
      '─'.repeat(60),
      `Pages walked:      offsets 0..${Math.max(0, totalSeen - 1)}`,
      `Inserted:          ${inserted}`,
      `Skipped (dupe):    ${skipped}`,
      `Failed:            ${failed}`,
      `Total seen:        ${totalSeen}`,
      '─'.repeat(60),
      '',
    ].join('\n'),
  );

  await db.destroy();
}

// ---------- per-exercise pipeline ----------

interface IngestOneArgs {
  db: Kysely<Database>;
  s3: S3Client;
  exercise: WorkoutXExercise;
  organisationId: string;
  ownerUserId: string;
}

async function ingestOne({ db, s3, exercise, organisationId, ownerUserId }: IngestOneArgs) {
  if (!exercise.gifUrl) {
    throw new Error('no gifUrl');
  }

  const exerciseId = randomUUID();
  const workDir = join(tmpdir(), `workoutx-${exerciseId}`);
  await mkdir(workDir, { recursive: true });

  try {
    // 1. Download GIF.
    const gifPath = join(workDir, 'source.gif');
    await downloadFile(exercise.gifUrl, gifPath);

    // 2. GIF → MP4. Faststart + yuv420p so the file plays in Safari/QuickTime
    //    without re-muxing, and we pad to even dimensions because libx264
    //    refuses odd width/height.
    const mp4Path = join(workDir, 'source.mp4');
    await runFfmpeg([
      '-y',
      '-i',
      gifPath,
      '-movflags',
      '+faststart',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      mp4Path,
    ]);

    // 3. MP4 → HLS (matches the production MediaConvert output structure
    //    closely enough that buildMediaAssets and the player work unchanged).
    //    One segment per 6s; vod playlist so the player knows it's finite.
    const hlsDir = join(workDir, 'hls');
    await mkdir(hlsDir, { recursive: true });
    await runFfmpeg([
      '-y',
      '-i',
      mp4Path,
      '-codec:',
      'copy',
      '-start_number',
      '0',
      '-hls_time',
      '6',
      '-hls_list_size',
      '0',
      '-hls_segment_filename',
      join(hlsDir, 'segment%d.ts'),
      '-f',
      'hls',
      join(hlsDir, 'video.m3u8'),
    ]);

    // 4. Thumbnail = first frame as JPG. Match the exact filename production
    //    MediaConvert writes so getThumbnailUrl finds it.
    const thumbPath = join(workDir, 'thumb.jpg');
    await runFfmpeg(['-y', '-i', mp4Path, '-frames:v', '1', '-q:v', '2', thumbPath]);

    // 5. Upload everything to S3.
    const uploadKey = s3Keys.upload.exercise({ visitorId: ownerUserId, filename: `${exerciseId}.mp4` }).video;
    const contentPaths = s3Keys.content.exercise({ userId: ownerUserId, exerciseId });

    // 5a. Raw MP4 in the upload bucket — satisfies the CHECK constraint and
    //     keeps the "originally uploaded video" contract intact.
    await putFile(s3, UPLOAD_BUCKET, uploadKey, mp4Path, 'video/mp4');

    // 5b. HLS playlist + segments in the content bucket at the production
    //     path so buildMediaAssets resolves them correctly.
    await putFile(s3, CONTENT_BUCKET, contentPaths.video, join(hlsDir, 'video.m3u8'), 'application/vnd.apple.mpegurl');
    const segments = (await readdir(hlsDir)).filter((f) => f.endsWith('.ts'));
    for (const seg of segments) {
      await putFile(s3, CONTENT_BUCKET, `${contentPaths.base}/${seg}`, join(hlsDir, seg), 'video/mp2t');
    }

    // 5c. Thumbnail at the conventional path getThumbnailUrl reads from.
    await putFile(s3, CONTENT_BUCKET, contentPaths.thumbnail, thumbPath, 'image/jpeg');

    // 6. Insert the exercise row. WorkoutX gives us a target muscle, body
    //    part, equipment, and instructions — we fold instructions into our
    //    `cues` array and use bodyPart as the category.
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto('exercises')
        .values({
          id: exerciseId,
          organisation_id: organisationId,
          user_id: ownerUserId,
          name: exercise.name,
          description: exercise.target ? `Target: ${exercise.target}` : null,
          cues: exercise.instructions ?? [],
          visibility: 'private',
          category: exercise.bodyPart ?? null,
          level: null,
          video_s3_bucket: UPLOAD_BUCKET,
          video_s3_key: uploadKey,
          video_mime_type: 'video/mp4',
          status: 'assets_done',
        } as never)
        .execute();

      // Equipment + muscle group links — best-effort; failures here log but
      // don't unwind the exercise row, since the catalogue entry is the
      // primary deliverable and these are decoration.
      if (exercise.equipment) {
        await linkEquipment(trx, exerciseId, exercise.equipment);
      }
      if (exercise.target) {
        await linkMuscleGroup(trx, exerciseId, exercise.target, true);
      }
      for (const m of exercise.secondaryMuscles ?? []) {
        await linkMuscleGroup(trx, exerciseId, m, false);
      }
    });
  } finally {
    // Always sweep the temp dir — these files add up fast across ~1000 runs.
    await rm(workDir, { recursive: true, force: true });
  }
}

// ---------- helpers ----------

async function linkEquipment(trx: Kysely<Database>, exerciseId: string, name: string) {
  const cleaned = name.trim();
  if (!cleaned || cleaned.toLowerCase() === 'body weight') return; // bodyweight is the default "no equipment"
  const existing = await trx
    .selectFrom('equipment')
    .where('name', '=', cleaned)
    .selectAll()
    .executeTakeFirst();
  const equipmentId =
    existing?.id ??
    (
      await trx
        .insertInto('equipment')
        .values({ id: randomUUID(), name: cleaned } as never)
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
  await trx
    .insertInto('exercise_equipment')
    .values({ exercise_id: exerciseId, equipment_id: equipmentId } as never)
    .onConflict((oc) => oc.doNothing())
    .execute();
}

async function linkMuscleGroup(trx: Kysely<Database>, exerciseId: string, name: string, isPrimary: boolean) {
  const cleaned = name.trim();
  if (!cleaned) return;
  const existing = await trx
    .selectFrom('muscle_groups')
    .where('name', '=', cleaned)
    .selectAll()
    .executeTakeFirst();
  const muscleGroupId =
    existing?.id ??
    (
      await trx
        .insertInto('muscle_groups')
        .values({ id: randomUUID(), name: cleaned } as never)
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
  await trx
    .insertInto('exercise_muscle_groups')
    .values({
      exercise_id: exerciseId,
      muscle_group_id: muscleGroupId,
      is_primary: isPrimary,
    } as never)
    .onConflict((oc) => oc.doNothing())
    .execute();
}

async function fetchPage(offset: number, limit: number): Promise<WorkoutXExercise[]> {
  const url = new URL(`${WORKOUTX_BASE}/exercises`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  const res = await fetch(url, {
    headers: { 'X-WorkoutX-Key': WORKOUTX_API_KEY! },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WorkoutX list failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as unknown;
  // The free tier returns an array directly; the paid tier wraps in
  // `{ data: [...] }`. We accept both.
  if (Array.isArray(data)) return data as WorkoutXExercise[];
  if (typeof data === 'object' && data !== null && 'data' in data && Array.isArray((data as { data: unknown[] }).data)) {
    return (data as { data: WorkoutXExercise[] }).data;
  }
  throw new Error('Unexpected list-exercises response shape');
}

async function downloadFile(url: string, dest: string) {
  const res = await fetch(url, { headers: { 'X-WorkoutX-Key': WORKOUTX_API_KEY! } });
  if (!res.ok) throw new Error(`download ${url} failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

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
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.split('\n').slice(-5).join(' ').slice(0, 200)}`));
    });
  });
}

async function putFile(s3: S3Client, bucket: string, key: string, path: string, contentType: string) {
  const body = await readFile(path);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

async function resolveOrg(db: Kysely<Database>, slug: string) {
  const org = await db.selectFrom('organisations').where('slug', '=', slug).selectAll().executeTakeFirst();
  if (!org) {
    fail(`Organisation with slug "${slug}" not found. Run \`pnpm seed run\` first if you want the seeded demo org, or pass --org=<existing-slug>.`);
  }
  // The owner membership picks the user that should own the imported rows.
  // ATHLETE memberships would point at clients of the org — we want a
  // staff-level user so the rows show up correctly in the admin UI.
  const ownerMembership = await db
    .selectFrom('organisation_memberships')
    .where('organisation_id', '=', org!.id)
    .where('role', 'in', [OrganisationRole.OWNER, OrganisationRole.ADMIN])
    .selectAll()
    .executeTakeFirst();
  if (!ownerMembership) {
    fail(`Organisation "${slug}" has no owner/admin member to attribute imported exercises to.`);
  }
  return { org: org!, ownerUserId: ownerMembership!.user_id };
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
  // Mirror the runtime S3 config so the script talks to the same MinIO (or
  // real S3) the server does. `forcePathStyle` is what makes MinIO addressing
  // work — production AWS clients ignore it.
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
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function fail(message: string): never {
  // eslint-disable-next-line no-console
  console.error(`[ingest] ${message}`);
  process.exit(1);
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

