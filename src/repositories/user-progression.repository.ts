import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { AvatarState, Database, UserProgression } from 'src/database/interfaces';

/**
 * Accepts either the injected (request-scoped) Kysely or a transaction handle —
 * the progression award runs inside a transaction and threads `trx` through.
 */
type Executor = Kysely<Database>;

/** One progression row per (user, org). See migration 1774404900000. */
@Injectable()
export class UserProgressionRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findByUserAndOrg(
    userId: string,
    organisationId: string,
    exec: Executor = this.db,
  ): Promise<UserProgression | undefined> {
    return exec
      .selectFrom('user_progression')
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .executeTakeFirst();
  }

  /** Insert-if-absent then return the row, so callers always have a row to bump. */
  async ensureRow(
    userId: string,
    organisationId: string,
    exec: Executor = this.db,
  ): Promise<UserProgression> {
    await exec
      .insertInto('user_progression')
      .values({ user_id: userId, organisation_id: organisationId })
      .onConflict((oc) => oc.columns(['user_id', 'organisation_id']).doNothing())
      .execute();
    const row = await this.findByUserAndOrg(userId, organisationId, exec);
    if (!row) throw new Error('Failed to ensure user_progression row');
    return row;
  }

  /** Write the freshly computed XP/level/streak for a row. */
  async applyAward(
    p: {
      id: string;
      xp: number;
      level: number;
      currentStreak: number;
      longestStreak: number;
      lastActiveDate: string | null;
      streakGraceRemaining: number;
      streakFreezes: number;
      streakTimezone: string | null;
    },
    exec: Executor = this.db,
  ): Promise<void> {
    await exec
      .updateTable('user_progression')
      .set({
        xp: p.xp,
        level: p.level,
        current_streak: p.currentStreak,
        longest_streak: p.longestStreak,
        last_active_date: p.lastActiveDate,
        streak_grace_remaining: p.streakGraceRemaining,
        streak_freezes: p.streakFreezes,
        streak_timezone: p.streakTimezone,
        updated_at: sql`now()`,
      })
      .where('id', '=', p.id)
      .execute();
  }

  async updateAvatarState(
    userId: string,
    organisationId: string,
    avatarState: AvatarState,
    exec: Executor = this.db,
  ): Promise<void> {
    await exec
      .updateTable('user_progression')
      .set({ avatar_state: JSON.stringify(avatarState), updated_at: sql`now()` })
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .execute();
  }
}
