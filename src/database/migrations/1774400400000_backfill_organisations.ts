import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Personal org for each existing coach, name = "<display_name>'s Workspace".
  await sql`
    INSERT INTO organisations (id, name, slug, created_by_user_id)
    SELECT
      gen_random_uuid(),
      COALESCE(NULLIF(display_name, ''), split_part(email, '@', 1)) || '''s Workspace',
      lower(regexp_replace(
        COALESCE(NULLIF(display_name, ''), split_part(email, '@', 1)),
        '[^a-zA-Z0-9]+', '-', 'g'
      )) || '-' || substring(id::text, 1, 8),
      id
    FROM users
    WHERE 'coach' = ANY(roles)
  `.execute(db);

  // 2. Shared "Personal Athletes" org for orphan athletes.
  await sql`
    INSERT INTO organisations (id, name, slug)
    SELECT gen_random_uuid(), 'Personal Athletes', 'personal-athletes'
    WHERE NOT EXISTS (SELECT 1 FROM organisations WHERE slug = 'personal-athletes')
  `.execute(db);

  // 3. "System" fallback org for any orphan data owned by admins or unknown users.
  await sql`
    INSERT INTO organisations (id, name, slug)
    SELECT gen_random_uuid(), 'System', 'system'
    WHERE NOT EXISTS (SELECT 1 FROM organisations WHERE slug = 'system')
  `.execute(db);

  // 4. Coach -> OWNER membership in their personal org.
  await sql`
    INSERT INTO organisation_memberships (organisation_id, user_id, role, accepted_at)
    SELECT o.id, u.id, 'owner'::organisation_role, now()
    FROM users u
    JOIN organisations o ON o.created_by_user_id = u.id
    WHERE 'coach' = ANY(u.roles)
    ON CONFLICT (organisation_id, user_id) DO NOTHING
  `.execute(db);

  // 5. Active coach-athlete relationships -> ATHLETE membership in the coach's org.
  await sql`
    INSERT INTO organisation_memberships (organisation_id, user_id, role, accepted_at)
    SELECT DISTINCT o.id, car.athlete_id, 'athlete'::organisation_role, now()
    FROM coach_athlete_relationships car
    JOIN organisations o ON o.created_by_user_id = car.coach_id
    WHERE car.status = 'active'
    ON CONFLICT (organisation_id, user_id) DO NOTHING
  `.execute(db);

  // 6. Athletes with no membership yet -> Personal Athletes org.
  await sql`
    INSERT INTO organisation_memberships (organisation_id, user_id, role, accepted_at)
    SELECT
      (SELECT id FROM organisations WHERE slug = 'personal-athletes'),
      u.id,
      'athlete'::organisation_role,
      now()
    FROM users u
    WHERE NOT ('coach' = ANY(u.roles))
      AND NOT EXISTS (SELECT 1 FROM organisation_memberships m WHERE m.user_id = u.id)
  `.execute(db);

  // 7. Tag coach_athlete_relationships by the coach's personal org.
  await sql`
    UPDATE coach_athlete_relationships car
    SET organisation_id = o.id
    FROM organisations o
    WHERE o.created_by_user_id = car.coach_id
      AND car.organisation_id IS NULL
  `.execute(db);

  // 8. Tag content tables by their user_id's primary org: coach's personal org if owner is a coach,
  //    otherwise the owner's first membership.
  for (const table of ['exercises', 'workouts', 'workout_plans', 'workout_schedules']) {
    await sql`
      UPDATE ${sql.raw(table)} t
      SET organisation_id = COALESCE(
        (SELECT id FROM organisations WHERE created_by_user_id = t.user_id),
        (SELECT organisation_id FROM organisation_memberships
          WHERE user_id = t.user_id ORDER BY created_at ASC LIMIT 1)
      )
      WHERE t.organisation_id IS NULL
    `.execute(db);
  }

  // 9. coach_assigned_workouts -> the coach's personal org.
  await sql`
    UPDATE coach_assigned_workouts caw
    SET organisation_id = (SELECT id FROM organisations WHERE created_by_user_id = caw.coach_id)
    WHERE caw.organisation_id IS NULL
  `.execute(db);

  // 10. Any rows still NULL (orphans / admin-owned content) -> System org.
  for (const table of [
    'coach_athlete_relationships',
    'exercises',
    'workouts',
    'workout_plans',
    'workout_schedules',
    'coach_assigned_workouts',
  ]) {
    await sql`
      UPDATE ${sql.raw(table)}
      SET organisation_id = (SELECT id FROM organisations WHERE slug = 'system')
      WHERE organisation_id IS NULL
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Best-effort rollback: clear org_id columns and remove the orgs/memberships this migration created.
  for (const table of [
    'coach_athlete_relationships',
    'exercises',
    'workouts',
    'workout_plans',
    'workout_schedules',
    'coach_assigned_workouts',
  ]) {
    await sql`UPDATE ${sql.raw(table)} SET organisation_id = NULL`.execute(db);
  }
  await sql`DELETE FROM organisation_memberships`.execute(db);
  await sql`DELETE FROM organisations`.execute(db);
}
