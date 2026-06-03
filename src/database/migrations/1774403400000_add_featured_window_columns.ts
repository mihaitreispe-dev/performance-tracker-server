import { Kysely, sql } from 'kysely';

/**
 * Add a `featured_from` / `featured_until` timestamp window to the
 * four content-bearing resource tables: workouts, courses,
 * content_items (movement snacks), workout_plans.
 *
 * Semantics: a resource is "featured" if NOW() falls between
 * featured_from (inclusive) and featured_until (exclusive). Both
 * sides may be NULL; the read side treats NULL as "open":
 *
 *   featured_from IS NOT NULL AND featured_until IS NULL → featured
 *     forever after featured_from. Useful for "evergreen featured
 *     item" coaches want to leave pinned.
 *
 *   featured_from IS NULL AND featured_until IS NOT NULL → featured
 *     up until that date. Useful for a piece that's already running
 *     and just needs an end date.
 *
 *   Both NULL → not featured. The default state for every row.
 *
 * The featured surface in the rehabit + athlete apps reads:
 *   WHERE featured_from IS NULL OR featured_from <= NOW()
 *     AND  (featured_until IS NULL OR featured_until > NOW())
 *     AND  (featured_from IS NOT NULL OR featured_until IS NOT NULL)
 *
 * A partial index on `featured_until` filtered to NOT NULL gives the
 * read side an efficient "expire soon" sweep — far smaller than a
 * full-table index since most rows have both columns null.
 *
 * No cross-table index: each table is scanned independently by its
 * own list endpoint.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  for (const table of ['workouts', 'courses', 'content_items', 'workout_plans']) {
    await sql`
      ALTER TABLE ${sql.raw(table)}
        ADD COLUMN featured_from TIMESTAMPTZ NULL,
        ADD COLUMN featured_until TIMESTAMPTZ NULL
    `.execute(db);

    await sql`
      ALTER TABLE ${sql.raw(table)}
        ADD CONSTRAINT ${sql.raw(`${table}_featured_window_chk`)}
        CHECK (
          featured_from IS NULL
          OR featured_until IS NULL
          OR featured_from < featured_until
        )
    `.execute(db);

    // Partial index — only the rows that are actually scheduled to
    // expire. Used by the public-API featured-content query and by
    // any future "wind down" cron. Most rows aren't featured so the
    // partial index stays tiny.
    await sql`
      CREATE INDEX ${sql.raw(`${table}_featured_until_idx`)}
        ON ${sql.raw(table)} (featured_until)
        WHERE featured_until IS NOT NULL
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ['workouts', 'courses', 'content_items', 'workout_plans']) {
    await sql`DROP INDEX IF EXISTS ${sql.raw(`${table}_featured_until_idx`)}`.execute(db);
    await sql`
      ALTER TABLE ${sql.raw(table)}
        DROP CONSTRAINT IF EXISTS ${sql.raw(`${table}_featured_window_chk`)}
    `.execute(db);
    await sql`
      ALTER TABLE ${sql.raw(table)}
        DROP COLUMN IF EXISTS featured_until,
        DROP COLUMN IF EXISTS featured_from
    `.execute(db);
  }
}
