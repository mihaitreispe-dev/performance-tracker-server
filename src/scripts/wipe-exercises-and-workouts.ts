/**
 * One-shot wipe of the exercise + workout catalogue (and everything keyed off
 * it) so we can repopulate from an external source. Run with:
 *
 *   pnpm exec ts-node -r tsconfig-paths/register src/scripts/wipe-exercises-and-workouts.ts
 *
 * What it deletes, in dependency order — every step is in one transaction so
 * a partial failure rolls back cleanly:
 *
 *   1. exercise_instances → cascades workout_items, set_completions and
 *      exercise_instance_group_items.
 *   2. exercise_instance_groups → cascades remaining group_items.
 *   3. workouts → cascades workout_items, workout_schedules, workout_plan_items,
 *      workout_executions (which themselves cascade further into set_completions,
 *      personal_records, fitness_metrics, cardio_metrics, weather, route, RPE,
 *      training_stress_scores, pain_logs, race_predictions, etc.).
 *   4. exercises → cascades exercise_equipment, exercise_muscle_groups,
 *      exercise_images, exercise_chains, exercise_chain_members, and the
 *      remaining personal_record + personal_record_history rows.
 *
 * The `exercise_instances.exercise_id` FK is ON DELETE RESTRICT, which is why
 * we delete instances *before* exercises — otherwise the wipe fails on the
 * exercise step.
 *
 * Counts of every wiped table are printed at the end so the operator can
 * sanity-check what was removed.
 */
import 'reflect-metadata';

import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import 'dotenv/config';

import type { Database } from '../database/interfaces';

async function main() {
  const db = new Kysely<Database>({
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

  try {
    const counts = await db.transaction().execute(async (trx) => {
      // Snapshot counts before we delete so the summary tells the operator
      // exactly how much they just removed.
      const before = await sql<{
        exercises: number;
        exercise_instances: number;
        exercise_instance_groups: number;
        workouts: number;
        workout_executions: number;
      }>`
        SELECT
          (SELECT count(*)::int FROM exercises) AS exercises,
          (SELECT count(*)::int FROM exercise_instances) AS exercise_instances,
          (SELECT count(*)::int FROM exercise_instance_groups) AS exercise_instance_groups,
          (SELECT count(*)::int FROM workouts) AS workouts,
          (SELECT count(*)::int FROM workout_executions) AS workout_executions
      `.execute(trx);

      // Order matters — exercise_instances has ON DELETE RESTRICT pointing at
      // exercises, so we have to clear instances (and everything reachable
      // through them) before we can drop the exercise rows.
      await trx.deleteFrom('set_completions').execute();
      await trx.deleteFrom('exercise_instance_group_items').execute();
      await trx.deleteFrom('exercise_instance_groups').execute();
      await trx.deleteFrom('workout_items').execute();
      await trx.deleteFrom('workout_plan_items').execute();
      await trx.deleteFrom('exercise_instances').execute();

      // workouts cascades into everything keyed off workout_id including
      // workout_executions and all their downstream analytics rows.
      await trx.deleteFrom('workouts').execute();

      // exercises cascades equipment links, muscle group links, images,
      // chains, chain members, and personal_records.
      await trx.deleteFrom('exercises').execute();

      return before.rows[0];
    });

    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '─'.repeat(60),
        'Catalogue wiped.',
        '─'.repeat(60),
        `exercises:                ${counts?.exercises ?? 0}`,
        `exercise_instances:       ${counts?.exercise_instances ?? 0}`,
        `exercise_instance_groups: ${counts?.exercise_instance_groups ?? 0}`,
        `workouts:                 ${counts?.workouts ?? 0}`,
        `workout_executions:       ${counts?.workout_executions ?? 0}`,
        '',
        'Everything downstream (set completions, PRs, training stress',
        'scores, weather, routes, pain logs, etc.) was wiped via the',
        'cascading foreign keys.',
        '─'.repeat(60),
        '',
      ].join('\n'),
    );
  } finally {
    await db.destroy();
  }
}

void main();
