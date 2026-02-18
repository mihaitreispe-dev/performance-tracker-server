import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('workout_plans')
    .addColumn('goal', sql`workout_plan_goal`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('workout_plans').dropColumn('goal').execute();
}
