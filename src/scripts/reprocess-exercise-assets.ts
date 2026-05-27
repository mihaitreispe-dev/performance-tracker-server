/**
 * Backfill: re-run the MediaConvert pipeline over the existing exercise
 * library so clips encoded before a pipeline change pick up the new
 * outputs — e.g. the 16:9 companion renditions + per-orientation stills.
 *
 * Each exercise's source clip lives in the upload bucket and is retained
 * after processing, so re-encoding needs no re-upload. We submit a fresh
 * MediaConvert job (reusing the real MediaConvertService so the job config
 * stays single-source) and flip the row to ASSETS_PENDING; the existing
 * cron watches each job to completion exactly as it does for new uploads.
 *
 * Run with:
 *
 *   pnpm exec ts-node -r tsconfig-paths/register \
 *     src/scripts/reprocess-exercise-assets.ts [flags]
 *
 * Flags:
 *   --status=<s1,s2>  Only re-encode exercises in these statuses.
 *                     Default: assets_done (the completed library).
 *                     Pass --status=all to ignore status (any row with a
 *                     source video).
 *   --limit=<n>       Stop after submitting N jobs (smoke test).
 *   --throttle=<ms>   Delay between job submissions. Default: 500.
 *   --dry-run         List what would be re-encoded; submit nothing.
 *
 * Requires the same AWS / MediaConvert env the server uses (S3_*,
 * AWS_*, MEDIACONVERT_*). With DISABLE_MEDIACONVERT=Y the script no-ops.
 */
import 'reflect-metadata';
import 'dotenv/config';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { ExerciseStatus } from '../database/interfaces';
import { s3Keys } from '../lib/util/s3-keys';
import { AppConfigModule } from '../modules/config/app-config.module';
import { AppConfigService } from '../modules/config/app-config.service';
import { DatabaseModule } from '../modules/database/database.module';
import { MediaConvertModule } from '../modules/mediaconvert/mediaconvert.module';
import { MediaConvertService } from '../modules/mediaconvert/mediaconvert.service';
import { ExerciseRepository } from '../repositories/exercise.repository';

@Module({
  imports: [AppConfigModule.forRoot(), DatabaseModule.forRoot(), MediaConvertModule.register()],
  providers: [ExerciseRepository],
})
class ReprocessModule {}

interface Args {
  status?: string;
  limit?: string;
  throttle?: string;
  'dry-run'?: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (const arg of argv) {
    if (arg === '--dry-run') {
      out['dry-run'] = true;
      continue;
    }
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) out[match[1] as keyof Args] = match[2] as never;
  }
  return out;
}

const ALL_STATUSES = Object.values(ExerciseStatus) as ExerciseStatus[];

function resolveStatuses(flag: string | undefined): ExerciseStatus[] | undefined {
  if (!flag) return [ExerciseStatus.ASSETS_DONE];
  if (flag === 'all') return undefined; // no status filter
  const requested = flag.split(',').map((s) => s.trim());
  const valid = requested.filter((s): s is ExerciseStatus => ALL_STATUSES.includes(s as ExerciseStatus));
  const invalid = requested.filter((s) => !valid.includes(s as ExerciseStatus));
  if (invalid.length > 0) {
    throw new Error(`Unknown status(es): ${invalid.join(', ')}. Valid: ${ALL_STATUSES.join(', ')}`);
  }
  return valid;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const statuses = resolveStatuses(args.status);
  const limit = args.limit ? Number.parseInt(args.limit, 10) : Number.POSITIVE_INFINITY;
  const throttleMs = args.throttle ? Number.parseInt(args.throttle, 10) : 500;
  const dryRun = !!args['dry-run'];

  const app = await NestFactory.createApplicationContext(ReprocessModule, { logger: ['error', 'warn'] });
  try {
    const config = app.get(AppConfigService);
    const exerciseRepo = app.get(ExerciseRepository);
    const mediaConvert = app.get(MediaConvertService);

    if (config.disableMediaConvert) {
      console.error('DISABLE_MEDIACONVERT is set — nothing to do. Run against an env with MediaConvert enabled.');
      return;
    }

    const contentBucket = config.s3ContentBucket;
    const exercises = await exerciseRepo.findAllWithSourceVideo(statuses);
    console.log(
      `Found ${exercises.length} exercise(s) with a source video` +
        `${statuses ? ` in status [${statuses.join(', ')}]` : ' (any status)'}` +
        `${dryRun ? ' — DRY RUN' : ''}.`,
    );

    let submitted = 0;
    let skipped = 0;
    let failed = 0;

    for (const exercise of exercises) {
      if (submitted >= limit) break;
      if (!exercise.video_s3_bucket || !exercise.video_s3_key) {
        skipped += 1;
        continue;
      }

      const s3Paths = s3Keys.content.exercise({ userId: exercise.user_id, exerciseId: exercise.id });
      const inputURL = `s3://${exercise.video_s3_bucket}/${exercise.video_s3_key}`;
      const outputS3Folder = `s3://${contentBucket}/${s3Paths.base}/`;

      if (dryRun) {
        console.log(`  [dry-run] ${exercise.id} (${exercise.name}) ← ${inputURL}`);
        submitted += 1;
        continue;
      }

      try {
        const job = await mediaConvert.createJob({ inputURL, outputS3Folder });
        if (!job) {
          failed += 1;
          console.warn(`  ✗ ${exercise.id} (${exercise.name}) — job creation returned null`);
          continue;
        }
        await exerciseRepo.updateById(exercise.id, {
          media_convert_job_id: job.Id,
          status: ExerciseStatus.ASSETS_PENDING,
        });
        submitted += 1;
        console.log(`  ✓ ${exercise.id} (${exercise.name}) → job ${job.Id}`);
        if (throttleMs > 0) await sleep(throttleMs);
      } catch (err) {
        failed += 1;
        console.warn(`  ✗ ${exercise.id} (${exercise.name}) — ${(err as Error).message}`);
      }
    }

    console.log(
      `\nDone. submitted=${submitted} skipped=${skipped} failed=${failed}.` +
        (dryRun ? ' (dry run — no jobs submitted)' : ' The cron will flip each to assets_done as it completes.'),
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
