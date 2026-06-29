/**
 * Throwaway E2E check for the progression award path — wires the real service
 * + repositories against the live DB (no Nest, no HTTP/auth) and asserts
 * exactly-once XP + streak + goal advancement. Run:
 *   DB_HOST=.. DB_PORT=.. DB_USER=.. DB_PASSWORD=.. DB_NAME=.. \
 *   npx ts-node -r tsconfig-paths/register src/scripts/verify-progression.ts
 */
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

import {
  Database,
  QuestAssignmentStatus,
  QuestObjectiveType,
  QuestPeriod,
  QuestStatus,
  UserGoalPeriod,
  UserGoalType,
} from 'src/database/interfaces';
import { ProgressionApiService } from 'src/modules/api/v1/progression/progression-api.service';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { QuestAssignmentRepository } from 'src/repositories/quest-assignment.repository';
import { SeasonRepository } from 'src/repositories/season.repository';
import { UserGoalRepository } from 'src/repositories/user-goal.repository';
import { UserProgressionEventRepository } from 'src/repositories/user-progression-event.repository';
import { UserProgressionRepository } from 'src/repositories/user-progression.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { UserSettingsRepository } from 'src/repositories/user-settings.repository';
import { UserUnlockRepository } from 'src/repositories/user-unlock.repository';

const EXEC_ID = '00000000-0000-4000-8000-000000000001';
const SNACK_ID = '00000000-0000-4000-8000-000000000002';
const EXEC_ID2 = '00000000-0000-4000-8000-000000000003';
const EXEC_ID3 = '00000000-0000-4000-8000-000000000004';

async function main() {
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      }),
    }),
  });

  try {
    const org = await db.selectFrom('organisations').select('id').limit(1).executeTakeFirstOrThrow();
    const user = await db.selectFrom('users').select('id').limit(1).executeTakeFirstOrThrow();
    const userId = user.id;
    const orgId = org.id;

    const progRepo = new UserProgressionRepository(db);
    const eventRepo = new UserProgressionEventRepository(db);
    const goalRepo = new UserGoalRepository(db);
    const questAssignmentRepo = new QuestAssignmentRepository(db);
    const seasonRepo = new SeasonRepository(db);
    const unlockRepo = new UserUnlockRepository(db);
    const relationshipRepo = new CoachAthleteRelationshipRepository(db);
    const userRepo = new UserRepository(db);
    const settingsRepo = new UserSettingsRepository(db);
    const svc = new ProgressionApiService(
      db,
      progRepo,
      eventRepo,
      goalRepo,
      questAssignmentRepo,
      seasonRepo,
      unlockRepo,
      relationshipRepo,
      userRepo,
      settingsRepo,
    );

    // Clean slate for this user+org.
    await db.deleteFrom('user_progression_events').where('source_id', 'in', [EXEC_ID, SNACK_ID]).execute();
    await db.deleteFrom('user_goals').where('user_id', '=', userId).where('organisation_id', '=', orgId).where('goal_type', '=', UserGoalType.WORKOUTS_COMPLETED).execute();
    await db.deleteFrom('user_progression').where('user_id', '=', userId).where('organisation_id', '=', orgId).execute();

    // A self-selected goal so we can see it advance.
    await goalRepo.create({
      user_id: userId,
      organisation_id: orgId,
      goal_type: UserGoalType.WORKOUTS_COMPLETED,
      target_value: 3,
      period: UserGoalPeriod.ONGOING,
    });

    // Workout finish (twice → idempotent), then a snack.
    await svc.awardForWorkout(userId, orgId, EXEC_ID, { partial: false });
    await svc.awardForWorkout(userId, orgId, EXEC_ID, { partial: false }); // dup — must not double-award
    await svc.awardForSnack(userId, orgId, SNACK_ID, {});

    const row = await progRepo.findByUserAndOrg(userId, orgId);
    const goals = await goalRepo.listForUser(userId, orgId);
    const ledger = await db
      .selectFrom('user_progression_events')
      .select((eb) => eb.fn.countAll<string>().as('c'))
      .where('source_id', 'in', [EXEC_ID, SNACK_ID])
      .executeTakeFirst();

    const goal = goals.find((g) => g.goal_type === UserGoalType.WORKOUTS_COMPLETED);
    console.log('--- progression ---');
    console.log({ xp: row?.xp, level: row?.level, streak: row?.current_streak, grace: row?.streak_grace_remaining, lastActive: row?.last_active_date });
    console.log('ledger rows (expect 2):', ledger?.c);
    console.log('workouts goal current/target (expect 1/3):', goal?.current_value, '/', goal?.target_value);

    const xpOk = row?.xp === 65; // 50 workout + 15 snack, no double
    const ledgerOk = Number(ledger?.c) === 2;
    const streakOk = row?.current_streak === 1;
    const goalOk = Number(goal?.current_value) === 1;
    console.log('\nRESULT:', xpOk && ledgerOk && streakOk && goalOk ? 'PASS ✓' : 'FAIL ✗', { xpOk, ledgerOk, streakOk, goalOk });

    // --- Phase-2: quest advancement (real-time, via the award path) + recap ---
    // A coach-authored quest, assigned to this user; an open window so the
    // workout-finish below bumps its progress in the same ledger-gated tx.
    await db.deleteFrom('quest_assignments').where('user_id', '=', userId).where('organisation_id', '=', orgId).execute();
    await db.deleteFrom('quests').where('organisation_id', '=', orgId).where('title', '=', 'verify-quest').execute();
    const quest = await db
      .insertInto('quests')
      .values({
        organisation_id: orgId,
        coach_id: userId, // reuse the same user as the "coach" — FK only needs a valid users.id
        title: 'verify-quest',
        description: null,
        objective_type: QuestObjectiveType.WORKOUTS_COMPLETED,
        target_value: 3,
        period: QuestPeriod.ONE_OFF,
        reward_xp: 25,
        due_date: null,
        status: QuestStatus.ACTIVE,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db
      .insertInto('quest_assignments')
      .values({
        quest_id: quest.id,
        organisation_id: orgId,
        user_id: userId,
        assigned_by_coach_id: userId,
        objective_type: QuestObjectiveType.WORKOUTS_COMPLETED,
        target_value: 3,
        reward_xp: 25,
        period: QuestPeriod.ONE_OFF,
        progress_value: 0,
        status: QuestAssignmentStatus.ACTIVE,
        window_start: '2026-06-01',
        window_end: null,
      })
      .execute();

    // A fresh workout finish → a new ledger row → quest progress +1 (idempotent on dup).
    await svc.awardForWorkout(userId, orgId, EXEC_ID2, { partial: false });
    await svc.awardForWorkout(userId, orgId, EXEC_ID2, { partial: false }); // dup — must not advance again

    const assignment = await db
      .selectFrom('quest_assignments')
      .select(['progress_value', 'status'])
      .where('user_id', '=', userId)
      .where('quest_id', '=', quest.id)
      .executeTakeFirst();

    const req = { user: { id: userId }, activeOrg: { organisationId: orgId } } as unknown as Parameters<
      typeof svc.getRecap
    >[0];
    const recap = await svc.getRecap(req, { period: 'week' });

    console.log('\n--- quests + recap ---');
    console.log('quest progress (expect 1/3, active):', assignment?.progress_value, '/3', assignment?.status);
    console.log('recap (week):', recap.data);

    const questOk = assignment?.progress_value === 1 && assignment?.status === 'active';
    // Recap counts the two distinct workout execs (EXEC_ID + EXEC_ID2) + the snack.
    const recapOk = recap.data.workouts === 2 && recap.data.snacks === 1 && recap.data.totalXp >= 65;
    console.log('\nPHASE2 RESULT:', questOk && recapOk ? 'PASS ✓' : 'FAIL ✗', { questOk, recapOk });

    // --- Phase-3: seasons (parallel points + grants), seasonal-equip gate, leaderboard ---
    // Season points are derived from the XP ledger over the active season's window.
    // By now this user earned 115 XP today (50 + 15 + 50), all inside the seeded
    // June 'meadow' season → crosses the 100-point ladder threshold → pot_wildflower
    // granted by award(); 300/600 not yet.
    await db.deleteFrom('user_unlocks').where('user_id', '=', userId).where('organisation_id', '=', orgId).execute();
    // grants happen in award(); re-finishing EXEC_ID2 is a dup (no new ledger row),
    // so re-run the awards' grant path by finishing the already-counted execs is a
    // no-op — instead just read what the earlier awards granted, then assert idempotency
    // by finishing one more distinct workout (still only crosses the 100 tier).
    await svc.awardForWorkout(userId, orgId, EXEC_ID3, { partial: false }); // +50 → 165, still < 300
    await svc.awardForWorkout(userId, orgId, EXEC_ID3, { partial: false }); // dup

    const unlocks = (
      await db.selectFrom('user_unlocks').select('cosmetic_id').where('user_id', '=', userId).where('organisation_id', '=', orgId).execute()
    ).map((r) => r.cosmetic_id);
    const wildflowerCount = unlocks.filter((c) => c === 'pot_wildflower').length;

    const season = await svc.getSeason(req);
    const reward100 = season.data?.rewards.find((r) => r.cosmeticId === 'pot_wildflower');
    const reward300 = season.data?.rewards.find((r) => r.cosmeticId === 'acc_fireflies');

    // Equip gate: an earned seasonal cosmetic is accepted; an unearned one (600) is rejected.
    let equipEarnedOk = false;
    let equipLockedRejected = false;
    try {
      await svc.updateAvatar(req, { equipped: { pot: 'pot_wildflower' } });
      equipEarnedOk = true;
    } catch {
      equipEarnedOk = false;
    }
    try {
      await svc.updateAvatar(req, { equipped: { world: 'world_meadow_bloom' } });
    } catch {
      equipLockedRejected = true;
    }

    // Leaderboard: reciprocal opt-in. Opted-out → optedIn:false; opted-in → I appear.
    await settingsRepo.upsert(userId, { leaderboard_opt_in: false });
    const lbOut = await svc.getLeaderboard(req);
    await settingsRepo.upsert(userId, { leaderboard_opt_in: true });
    const lbIn = await svc.getLeaderboard(req);
    const me = lbIn.data.entries.find((e) => e.isMe);

    console.log('\n--- season + leaderboard ---');
    console.log('unlocks:', unlocks, '(pot_wildflower x' + wildflowerCount + ')');
    console.log('season:', { theme: season.data?.theme, points: season.data?.points, r100: reward100?.earned, r300: reward300?.earned });
    console.log('equip earned ok:', equipEarnedOk, '| locked rejected:', equipLockedRejected);
    console.log('leaderboard optedOut:', lbOut.data.optedIn, '| optedIn:', lbIn.data.optedIn, '| me:', me ? `${me.name} ${me.points}pts rank${me.rank}` : 'absent');

    const seasonGrantOk = unlocks.includes('pot_wildflower') && !unlocks.includes('acc_fireflies') && wildflowerCount === 1;
    const seasonDtoOk = season.data?.theme === 'meadow' && season.data?.points === 165 && reward100?.earned === true && reward300?.earned === false;
    const equipOk = equipEarnedOk && equipLockedRejected;
    const leaderboardOk = lbOut.data.optedIn === false && lbIn.data.optedIn === true && !!me && me.points === 165;
    console.log('\nPHASE3 RESULT:', seasonGrantOk && seasonDtoOk && equipOk && leaderboardOk ? 'PASS ✓' : 'FAIL ✗', {
      seasonGrantOk,
      seasonDtoOk,
      equipOk,
      leaderboardOk,
    });

    // Cleanup.
    await settingsRepo.upsert(userId, { leaderboard_opt_in: false });
    await db.deleteFrom('user_unlocks').where('user_id', '=', userId).where('organisation_id', '=', orgId).execute();
    await db.deleteFrom('quest_assignments').where('user_id', '=', userId).where('organisation_id', '=', orgId).execute();
    await db.deleteFrom('quests').where('organisation_id', '=', orgId).where('title', '=', 'verify-quest').execute();
    await db.deleteFrom('user_progression_events').where('source_id', 'in', [EXEC_ID, EXEC_ID2, EXEC_ID3, SNACK_ID]).execute();
    await db.deleteFrom('user_goals').where('user_id', '=', userId).where('organisation_id', '=', orgId).where('goal_type', '=', UserGoalType.WORKOUTS_COMPLETED).execute();
    await db.deleteFrom('user_progression').where('user_id', '=', userId).where('organisation_id', '=', orgId).execute();
    console.log('cleaned up');
  } finally {
    await db.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
