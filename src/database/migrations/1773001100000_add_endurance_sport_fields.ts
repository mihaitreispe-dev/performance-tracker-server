import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create enum for endurance sports
  await sql`
    CREATE TYPE endurance_sport AS ENUM (
      'running',
      'cycling',
      'swimming',
      'triathlon',
      'other'
    )
  `.execute(db);

  // Add new structured columns
  await db.schema
    .alterTable('athlete_intake')
    .addColumn('endurance_sport', sql`endurance_sport`)
    .execute();

  await db.schema.alterTable('athlete_intake').addColumn('endurance_sport_other', 'text').execute();

  await db.schema
    .alterTable('athlete_intake')
    .addColumn('target_events', sql`text[]`)
    .execute();

  await db.schema.alterTable('athlete_intake').addColumn('target_event_other', 'text').execute();

  // Migrate existing data: try to map primary_sport to endurance_sport
  await sql`
    UPDATE athlete_intake
    SET endurance_sport = CASE
      WHEN LOWER(primary_sport) LIKE '%run%' THEN 'running'::endurance_sport
      WHEN LOWER(primary_sport) LIKE '%cycl%' OR LOWER(primary_sport) LIKE '%bike%' THEN 'cycling'::endurance_sport
      WHEN LOWER(primary_sport) LIKE '%swim%' THEN 'swimming'::endurance_sport
      WHEN LOWER(primary_sport) LIKE '%tri%' THEN 'triathlon'::endurance_sport
      WHEN primary_sport IS NOT NULL AND primary_sport != '' THEN 'other'::endurance_sport
      ELSE NULL
    END,
    endurance_sport_other = CASE
      WHEN LOWER(primary_sport) NOT LIKE '%run%'
        AND LOWER(primary_sport) NOT LIKE '%cycl%'
        AND LOWER(primary_sport) NOT LIKE '%bike%'
        AND LOWER(primary_sport) NOT LIKE '%swim%'
        AND LOWER(primary_sport) NOT LIKE '%tri%'
        AND primary_sport IS NOT NULL
        AND primary_sport != ''
      THEN primary_sport
      ELSE NULL
    END
    WHERE primary_sport IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('athlete_intake').dropColumn('target_event_other').execute();
  await db.schema.alterTable('athlete_intake').dropColumn('target_events').execute();
  await db.schema.alterTable('athlete_intake').dropColumn('endurance_sport_other').execute();
  await db.schema.alterTable('athlete_intake').dropColumn('endurance_sport').execute();
  await sql`DROP TYPE IF EXISTS endurance_sport`.execute(db);
}
