import { Kysely, sql } from 'kysely';

/**
 * Phase 3 — org onboarding questionnaires that feed the workout generator.
 *
 * Separate from the existing `questionnaire_templates` family (which is the coach-
 * scoped per-athlete check-in surface) so the two evolve independently. These rows
 * are org-scoped and drive the public API: org publishes a questionnaire, the
 * integrating app collects answers, server derives profile tags + generates a
 * starter workout from the org's exercise library.
 *
 *   onboarding_questionnaires.schema_json — full definition. Shape governed by the
 *     validator in src/modules/api/v1/public/questionnaires/schema.ts; storing JSON
 *     so we can iterate the form without a migration every time we add a question
 *     type.
 *
 *   onboarding_responses.derived_tags — flat string[] of profile tags
 *     ("level:beginner", "goal:hypertrophy", "equipment:dumbbells", ...) computed
 *     server-side from `answers_json` so downstream consumers (generator, future
 *     ML) don't have to re-walk the schema.
 *
 *   workouts.generated_from_response_id — audit trail linking generated workouts
 *     back to the response that produced them. Nullable; existing workouts are
 *     unaffected.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('onboarding_questionnaires')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar(200)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('schema_json', 'jsonb', (col) => col.notNull().defaultTo(sql`'{"questions":[]}'::jsonb`))
    .addColumn('is_published', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_by_user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('onboarding_questionnaires_org_published_idx')
    .on('onboarding_questionnaires')
    .columns(['organisation_id', 'is_published'])
    .execute();

  await db.schema
    .createTable('onboarding_responses')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('questionnaire_id', 'uuid', (col) =>
      col.notNull().references('onboarding_questionnaires.id').onDelete('cascade'),
    )
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('answers_json', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('derived_tags', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('completed_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('onboarding_responses_user_org_idx')
    .on('onboarding_responses')
    .columns(['organisation_id', 'user_id', 'completed_at'])
    .execute();

  await db.schema
    .alterTable('workouts')
    .addColumn('generated_from_response_id', 'uuid', (col) =>
      col.references('onboarding_responses.id').onDelete('set null'),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('workouts').dropColumn('generated_from_response_id').execute();
  await db.schema.dropTable('onboarding_responses').execute();
  await db.schema.dropTable('onboarding_questionnaires').execute();
}
