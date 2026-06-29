import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, ProgressionSourceType, UserProgressionEvent } from 'src/database/interfaces';

type Executor = Kysely<Database>;

/** Append-only XP ledger — the exactly-once gate for awards. Migration 1774404900000. */
@Injectable()
export class UserProgressionEventRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  /**
   * Insert a ledger row, idempotent on (source_type, source_id). Returns true
   * only when the row was newly inserted — false means this source was already
   * awarded (re-finish / replay), so the caller must NOT bump XP again.
   */
  async insertIfNew(
    p: {
      userId: string;
      organisationId: string;
      sourceType: ProgressionSourceType;
      sourceId: string;
      xpAwarded: number;
      metadata?: Record<string, unknown>;
    },
    exec: Executor = this.db,
  ): Promise<boolean> {
    const inserted = await exec
      .insertInto('user_progression_events')
      .values({
        user_id: p.userId,
        organisation_id: p.organisationId,
        source_type: p.sourceType,
        source_id: p.sourceId,
        xp_awarded: p.xpAwarded,
        metadata: JSON.stringify(p.metadata ?? {}),
      })
      .onConflict((oc) => oc.columns(['source_type', 'source_id']).doNothing())
      .returning('id')
      .executeTakeFirst();
    return !!inserted;
  }

  /** Aggregate the ledger over a window (the recap). Counts active days by
   *  distinct event date. INTEGER casts keep the driver returning numbers. */
  async aggregateSince(
    userId: string,
    organisationId: string,
    since: Date,
  ): Promise<{ totalXp: number; workouts: number; snacks: number; questRewards: number; activeDays: number }> {
    const result = await sql<{
      total_xp: number;
      workouts: number;
      snacks: number;
      quest_rewards: number;
      active_days: number;
    }>`
      select
        coalesce(sum(xp_awarded), 0)::int as total_xp,
        count(*) filter (where source_type = 'workout_execution')::int as workouts,
        count(*) filter (where source_type = 'snack_completion')::int as snacks,
        count(*) filter (where source_type = 'quest_reward')::int as quest_rewards,
        count(distinct (created_at)::date)::int as active_days
      from user_progression_events
      where user_id = ${userId} and organisation_id = ${organisationId} and created_at >= ${since}
    `.execute(this.db);
    const r = result.rows[0];
    return {
      totalXp: r?.total_xp ?? 0,
      workouts: r?.workouts ?? 0,
      snacks: r?.snacks ?? 0,
      questRewards: r?.quest_rewards ?? 0,
      activeDays: r?.active_days ?? 0,
    };
  }

  /**
   * Phase-3 season points + active days for a SET of users in one org, over an
   * inclusive date window [startsOn, endsOn] ('YYYY-MM-DD'). "Season points" =
   * XP earned in the window (derived; never stored). Powers both my-own-points
   * and the cohort leaderboard. Users with no events simply won't appear in the
   * map (callers default to 0).
   */
  async seasonPointsForUsers(
    userIds: string[],
    organisationId: string,
    startsOn: string,
    endsOn: string,
    exec: Executor = this.db,
  ): Promise<Map<string, { points: number; activeDays: number }>> {
    if (userIds.length === 0) return new Map();
    const result = await sql<{ user_id: string; points: number; active_days: number }>`
      select
        user_id,
        coalesce(sum(xp_awarded), 0)::int as points,
        count(distinct (created_at)::date)::int as active_days
      from user_progression_events
      where organisation_id = ${organisationId}
        and user_id = ANY(${userIds})
        and (created_at)::date >= ${startsOn}::date
        and (created_at)::date <= ${endsOn}::date
      group by user_id
    `.execute(exec);
    const map = new Map<string, { points: number; activeDays: number }>();
    for (const r of result.rows) {
      map.set(r.user_id, { points: r.points ?? 0, activeDays: r.active_days ?? 0 });
    }
    return map;
  }

  /** A single user's season points + active days over the window. */
  async seasonPoints(
    userId: string,
    organisationId: string,
    startsOn: string,
    endsOn: string,
    exec: Executor = this.db,
  ): Promise<{ points: number; activeDays: number }> {
    const map = await this.seasonPointsForUsers([userId], organisationId, startsOn, endsOn, exec);
    return map.get(userId) ?? { points: 0, activeDays: 0 };
  }

  /** Reverse-chronological ledger for a user+org — Phase-2 recap source. */
  async listForUser(
    userId: string,
    organisationId: string,
    opts?: { limit?: number },
  ): Promise<UserProgressionEvent[]> {
    return this.db
      .selectFrom('user_progression_events')
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(opts?.limit ?? 200)
      .execute();
  }
}
