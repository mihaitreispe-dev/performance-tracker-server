import { Kysely, sql } from 'kysely';

/**
 * GPX-derived start location on `athlete_races`.
 *
 * We removed the external race-finding providers (RunSignUp, ACTIVE,
 * World Triathlon, OpenTrack); the only remaining way to attach a
 * course to a race is a GPX/FIT upload. Those providers used to be the
 * sole source of lat/long, which the weather-forecast feature reads to
 * fetch a race-day forecast. To keep weather working after the removal,
 * we now derive the start lat/long from the uploaded course file's first
 * route point and persist it here.
 *
 * Nullable: a manual race with no course file has no location (weather
 * simply skips it, as it did before for races without an event). Legacy
 * rows that still carry a `race_event_id` fall back to the event's
 * lat/long in the forecast resolvers.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE athlete_races
      ADD COLUMN latitude DOUBLE PRECISION,
      ADD COLUMN longitude DOUBLE PRECISION
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE athlete_races
      DROP COLUMN IF EXISTS latitude,
      DROP COLUMN IF EXISTS longitude
  `.execute(db);
}
