import { Kysely, sql } from 'kysely';
import { randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';

/**
 * Demo "RA" organisation — provisions a turn-key tenant the sample app
 * (performance-tracker-sample-app) can point at without any manual setup.
 *
 * What this seed creates:
 *   - a placeholder system user that owns the seeded content (firebase_uid =
 *     "system:demo-seed", provider = "system" — not a real Firebase identity).
 *   - the RA organisation with the sage/navy theme matching the brand
 *     screenshot, copy_overrides seeded for an "individual coach" style track.
 *   - an API key with the public read scopes + a redirect_uri allow-list
 *     covering the sample app's web + native callbacks. The cleartext key is
 *     **printed to stdout** at the end of the run — copy it into the sample
 *     app's `.env` as VITE_CLIENT_ID. It cannot be retrieved later.
 *   - 3 demo exercises with prescribed instances bundled into a single
 *     "Antrenament de probă" workout.
 *   - 1 movement snack and 1 course as placeholders so every catalogue tab
 *     in the sample app has something to show.
 *
 * Idempotency: if an organisation with slug 'ra-demo' already exists the seed
 * exits with a message instead of double-inserting. To reset, delete the org
 * row manually (cascades handle the rest).
 *
 * Everything happens inside a single transaction so a partial failure leaves
 * no dangling rows.
 */
export async function seed(db: Kysely<unknown>): Promise<void> {
  const existing = await sql<{ id: string }>`
    SELECT id FROM organisations WHERE slug = 'ra-demo' LIMIT 1
  `.execute(db);
  if (existing.rows.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[demo-seed] Organisation "ra-demo" already exists. Skipping.');
    return;
  }

  // Generate the API key cleartext outside the txn — it's purely a value
  // we hash on the way in, so the txn only sees the hash.
  const secret = randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const fullKey = `sz_test_${secret}`;
  const keyPrefix = fullKey.slice(0, 16);
  const keyHash = await bcrypt.hash(fullKey, 12);

  const systemUserId = randomUUID();
  const orgId = randomUUID();
  const workoutId = randomUUID();

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('users' as never)
      .values({
        id: systemUserId,
        firebase_uid: `system:demo-seed-${Date.now()}`,
        email: `demo-seed+${Date.now()}@example.invalid`,
        display_name: 'RA Demo Seed',
        provider: 'system',
        roles: ['user'],
        fcm_tokens: [],
      } as never)
      .execute();

    await trx
      .insertInto('organisations' as never)
      .values({
        id: orgId,
        name: 'RA',
        slug: 'ra-demo',
        created_by_user_id: systemUserId,
        org_type: 'individual',
      } as never)
      .execute();

    await trx
      .insertInto('organisation_memberships' as never)
      .values({
        id: randomUUID(),
        organisation_id: orgId,
        user_id: systemUserId,
        role: 'owner',
        accepted_at: sql`now()`,
        metadata: {},
      } as never)
      .execute();

    // Theme matches the brand screenshot in both variants:
    //   Light — deep navy primary on cream + sage accents (the hero
    //     "Ce facem" look). Used for the daytime / default mode.
    //   Dark — same palette flipped: cream becomes the text colour
    //     against a deep-navy background, with sage staying as the
    //     accent so brand recognition carries over.
    await trx
      .insertInto('organisation_themes' as never)
      .values({
        organisation_id: orgId,
        theme_tokens: {
          primary: '#1a2541',
          secondary: '#a8c9a8',
          background: '#fdfcf7',
          surface: '#ffffff',
          text: '#1a2541',
        },
        theme_tokens_dark: {
          // Primary = sage so CTAs pop on the dark background; navy text
          // wouldn't have enough contrast as a button colour here.
          primary: '#a8c9a8',
          secondary: '#d7e8d2',
          background: '#0b1422',
          surface: '#1a2541',
          text: '#fdfcf7',
        },
        copy_overrides: {
          athlete: 'membru',
          athletes: 'membri',
        },
      } as never)
      .execute();

    await trx
      .insertInto('organisation_api_keys' as never)
      .values({
        id: randomUUID(),
        organisation_id: orgId,
        name: 'Sample app (seeded)',
        key_prefix: keyPrefix,
        key_hash: keyHash,
        scopes: [
          'workouts:read',
          'courses:read',
          'movement_snacks:read',
          'exercises:read',
          'clients:read',
          'clients:create',
          'auth:exchange',
          'schedules:read',
          'executions:read',
          'executions:write',
        ],
        redirect_uris: [
          'http://localhost:5180/callback',
          'com.example.performancesample://callback',
        ],
        created_by_user_id: systemUserId,
      } as never)
      .execute();

    // ---- demo content ----

    const squatExId = randomUUID();
    const pushupExId = randomUUID();
    const plankExId = randomUUID();
    await trx
      .insertInto('exercises' as never)
      .values([
        {
          id: squatExId,
          organisation_id: orgId,
          user_id: systemUserId,
          name: 'Genuflexiuni cu greutate proprie',
          description: 'Lucrăm întregul lanț posterior — fese, ischiogambieri, cvadriceps.',
          cues: ['Tălpile la lățimea umerilor', 'Greutatea pe călcâie', 'Spatele drept'],
          status: 'assets_done',
        },
        {
          id: pushupExId,
          organisation_id: orgId,
          user_id: systemUserId,
          name: 'Flotări',
          description: 'Forță în piept, umeri și triceps.',
          cues: ['Corpul în linie dreaptă', 'Coatele la 45°', 'Coboară controlat'],
          status: 'assets_done',
        },
        {
          id: plankExId,
          organisation_id: orgId,
          user_id: systemUserId,
          name: 'Plank',
          description: 'Stabilitate pentru întregul trunchi.',
          cues: ['Contractează abdomenul', 'Şoldurile aliniate', 'Respiră calm'],
          status: 'assets_done',
        },
      ] as never)
      .execute();

    const squatEiId = randomUUID();
    const pushupEiId = randomUUID();
    const plankEiId = randomUUID();
    await trx
      .insertInto('exercise_instances' as never)
      .values([
        { id: squatEiId, exercise_id: squatExId, mode: 'reps', sets: 3, reps: 12, intensity: 'moderate' },
        { id: pushupEiId, exercise_id: pushupExId, mode: 'reps', sets: 3, reps: 10, intensity: 'moderate' },
        { id: plankEiId, exercise_id: plankExId, mode: 'time', sets: 3, execution_time: 45, intensity: 'moderate' },
      ] as never)
      .execute();

    await trx
      .insertInto('workouts' as never)
      .values({
        id: workoutId,
        organisation_id: orgId,
        user_id: systemUserId,
        name: 'Antrenament de probă',
        description: 'Sesiune scurtă cu mişcări fundamentale. 15–20 de minute.',
        difficulty: 'easy',
        type: 'strength',
      } as never)
      .execute();

    await trx
      .insertInto('workout_items' as never)
      .values([
        { id: randomUUID(), workout_id: workoutId, exercise_instance_id: squatEiId, position: 1 },
        { id: randomUUID(), workout_id: workoutId, exercise_instance_id: pushupEiId, position: 2 },
        { id: randomUUID(), workout_id: workoutId, exercise_instance_id: plankEiId, position: 3 },
      ] as never)
      .execute();

    await trx
      .insertInto('content_items' as never)
      .values({
        id: randomUUID(),
        organisation_id: orgId,
        owner_user_id: systemUserId,
        kind: 'snack',
        title: 'Activare matinală 5 minute',
        description: 'Mobilitate uşoară pentru începutul zilei.',
        status: 'ready',
        tags: ['mobilitate', 'matinal'],
      } as never)
      .execute();

    await trx
      .insertInto('courses' as never)
      .values({
        id: randomUUID(),
        organisation_id: orgId,
        owner_user_id: systemUserId,
        title: 'Bazele unui stil de viaţă sustenabil',
        description: 'Patru lecţii despre alimentaţie, mişcare, somn şi reziliență.',
        status: 'published',
      } as never)
      .execute();
  });

  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      '─'.repeat(64),
      'RA demo organisation seeded.',
      '─'.repeat(64),
      `Organisation id:  ${orgId}`,
      `Slug:             ra-demo`,
      `Sample workout:   ${workoutId} ("Antrenament de probă")`,
      '',
      'API key (copy into the sample app .env as VITE_CLIENT_ID):',
      '',
      `  ${fullKey}`,
      '',
      'This key is shown ONCE — re-run requires deleting the org row first.',
      '─'.repeat(64),
      '',
    ].join('\n'),
  );
}
