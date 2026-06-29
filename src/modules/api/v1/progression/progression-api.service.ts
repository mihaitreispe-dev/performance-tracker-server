import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';

import {
  CoachAthleteStatus,
  Database,
  ProgressionSourceType,
  QuestObjectiveType,
  Season,
  UnlockSource,
  UserGoal,
  UserGoalPeriod,
  UserGoalStatus,
  UserGoalType,
  UserGoalUpdate,
} from 'src/database/interfaces';
import { assertActiveOrg } from 'src/lib/util/active-org';
import { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';
import { KYSELY_ROOT } from 'src/modules/database/database.module';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { QuestAssignmentRepository } from 'src/repositories/quest-assignment.repository';
import { SeasonRepository } from 'src/repositories/season.repository';
import { UserGoalRepository } from 'src/repositories/user-goal.repository';
import { UserProgressionEventRepository } from 'src/repositories/user-progression-event.repository';
import { UserProgressionRepository } from 'src/repositories/user-progression.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { UserSettingsRepository } from 'src/repositories/user-settings.repository';
import { UserUnlockRepository } from 'src/repositories/user-unlock.repository';

import {
  advanceStreak,
  applyFreezeEarnings,
  HABIT_ESTABLISHED_LEVEL,
  levelForXp,
  levelProgress,
  SNACK_XP,
  toDayString,
  WORKOUT_PARTIAL_XP,
  WORKOUT_XP,
} from './progression.math';
import { validateEquip } from './avatar-cosmetics';
import { ladderForTheme } from './season-cosmetics';
import { CreateGoalBody, RecapQuery, UpdateAvatarBody, UpdateGoalBody } from './request.dto';
import {
  GoalDTO,
  GoalListResponse,
  GoalResponse,
  JourneySummaryDTO,
  JourneySummaryResponse,
  LeaderboardEntryDTO,
  LeaderboardResponse,
  QuestListResponse,
  QuestSummaryDTO,
  RecapDTO,
  RecapResponse,
  SeasonDTO,
  SeasonResponse,
} from './response.dto';

/**
 * Org-scoped "Journey" progression — XP/levels, a forgiving streak, and
 * self-selected goals. The award path is idempotent (the XP ledger gates it)
 * and runs on the ROOT Kysely connection so a fire-and-forget award never
 * entangles with the request-scoped RLS transaction. Read/CRUD endpoints use
 * the request-scoped repositories.
 */
@Injectable()
export class ProgressionApiService {
  private readonly logger = new Logger(ProgressionApiService.name);

  constructor(
    @Inject(KYSELY_ROOT) private readonly root: Kysely<Database>,
    private readonly progressionRepo: UserProgressionRepository,
    private readonly eventRepo: UserProgressionEventRepository,
    private readonly goalRepo: UserGoalRepository,
    private readonly questAssignmentRepo: QuestAssignmentRepository,
    private readonly seasonRepo: SeasonRepository,
    private readonly unlockRepo: UserUnlockRepository,
    private readonly relationshipRepo: CoachAthleteRelationshipRepository,
    private readonly userRepo: UserRepository,
    private readonly settingsRepo: UserSettingsRepository,
  ) {}

  // ---- awards (called fire-and-forget from the completion hooks) ----------

  async awardForWorkout(
    userId: string,
    organisationId: string | undefined,
    executionId: string,
    opts: { partial?: boolean; tz?: string; scheduleId?: string | null },
  ): Promise<void> {
    await this.award({
      userId,
      organisationId,
      sourceType: ProgressionSourceType.WORKOUT_EXECUTION,
      sourceId: executionId,
      xp: opts.partial ? WORKOUT_PARTIAL_XP : WORKOUT_XP,
      tz: opts.tz,
      scheduleId: opts.scheduleId ?? undefined,
      metadata: { partial: !!opts.partial },
    });
  }

  async awardForSnack(
    userId: string,
    organisationId: string | undefined,
    snackCompletionId: string,
    opts: { tz?: string },
  ): Promise<void> {
    await this.award({
      userId,
      organisationId,
      sourceType: ProgressionSourceType.SNACK_COMPLETION,
      sourceId: snackCompletionId,
      xp: SNACK_XP,
      tz: opts.tz,
      metadata: {},
    });
  }

  private async award(p: {
    userId: string;
    organisationId: string | undefined;
    sourceType: ProgressionSourceType;
    sourceId: string;
    xp: number;
    tz?: string;
    scheduleId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    // Org-agnostic token (no JWT org claim) — nothing to scope progression to.
    if (!p.organisationId) return;
    const organisationId = p.organisationId;

    await this.root.transaction().execute(async (trx) => {
      // Exactly-once gate: only the first award for this source bumps XP.
      const isNew = await this.eventRepo.insertIfNew(
        {
          userId: p.userId,
          organisationId,
          sourceType: p.sourceType,
          sourceId: p.sourceId,
          xpAwarded: p.xp,
          metadata: p.metadata,
        },
        trx,
      );
      if (!isNew) return;

      const row = await this.progressionRepo.ensureRow(p.userId, organisationId, trx);
      const today = localDateString(p.tz);
      const streak = advanceStreak(
        {
          currentStreak: row.current_streak,
          longestStreak: row.longest_streak,
          lastActiveDate: toDayString(row.last_active_date),
          graceRemaining: row.streak_grace_remaining,
          freezesRemaining: row.streak_freezes,
        },
        today,
      );
      const oldLevel = levelForXp(row.xp);
      const xp = row.xp + p.xp;
      const newLevel = levelForXp(xp);
      // Earn a freeze when crossing a level-up milestone (capped), on top of any
      // freeze the streak just consumed.
      const freezes = applyFreezeEarnings(streak.freezesRemaining, oldLevel, newLevel);
      await this.progressionRepo.applyAward(
        {
          id: row.id,
          xp,
          level: newLevel,
          currentStreak: streak.currentStreak,
          longestStreak: streak.longestStreak,
          lastActiveDate: streak.lastActiveDate,
          streakGraceRemaining: streak.graceRemaining,
          streakFreezes: freezes,
          streakTimezone: p.tz ?? row.streak_timezone ?? null,
        },
        trx,
      );

      const goalType =
        p.sourceType === ProgressionSourceType.WORKOUT_EXECUTION
          ? UserGoalType.WORKOUTS_COMPLETED
          : UserGoalType.SNACKS_COMPLETED;
      await this.goalRepo.incrementSystemGoals(p.userId, organisationId, goalType, 1, trx);
      // Count an active day only the first time the user does anything today.
      if (streak.changed) {
        await this.goalRepo.incrementSystemGoals(
          p.userId,
          organisationId,
          UserGoalType.ACTIVE_DAYS,
          1,
          trx,
        );
      }

      // Quests — advance activity-driven objectives in real time (increment-only;
      // the cron owns completion/reward + state-derived objectives). Mirrors the
      // goal increments above so no objective is touched by both paths.
      const questObjective =
        p.sourceType === ProgressionSourceType.WORKOUT_EXECUTION
          ? QuestObjectiveType.WORKOUTS_COMPLETED
          : QuestObjectiveType.SNACKS_COMPLETED;
      await this.questAssignmentRepo.advanceProgress(p.userId, organisationId, questObjective, 1, today, trx);
      if (streak.changed) {
        await this.questAssignmentRepo.advanceProgress(
          p.userId,
          organisationId,
          QuestObjectiveType.ACTIVE_DAYS,
          1,
          today,
          trx,
        );
      }
      if (p.sourceType === ProgressionSourceType.WORKOUT_EXECUTION && p.scheduleId) {
        await this.questAssignmentRepo.advanceProgress(
          p.userId,
          organisationId,
          QuestObjectiveType.PLAN_ADHERENCE,
          1,
          today,
          trx,
        );
      }

      // Seasonal cosmetics — grant any ladder rewards whose season-points
      // threshold the user has now crossed (idempotent via user_unlocks). Season
      // points are derived from the ledger over the active season's window, so
      // this runs inside the trx to count the row just inserted above.
      await this.grantSeasonRewards(p.userId, organisationId, today, trx);
    });
  }

  /**
   * Grant the seasonal cosmetics the user has earned this season. Season points =
   * XP in the active season's [starts_on, ends_on] window (derived). Lifetime
   * xp/level are never touched. No-op when no season is active.
   */
  private async grantSeasonRewards(
    userId: string,
    organisationId: string,
    today: string,
    trx: Kysely<Database>,
  ): Promise<void> {
    const season = await this.seasonRepo.findActive(today);
    if (!season) return;
    const ladder = ladderForTheme(season.theme);
    if (ladder.length === 0) return;
    const { points } = await this.eventRepo.seasonPoints(
      userId,
      organisationId,
      toDayString(season.starts_on)!,
      toDayString(season.ends_on)!,
      trx,
    );
    for (const reward of ladder) {
      if (points >= reward.pointsThreshold) {
        await this.unlockRepo.grantIfNew(
          {
            user_id: userId,
            organisation_id: organisationId,
            cosmetic_id: reward.cosmeticId,
            source: UnlockSource.SEASON,
            season_id: season.id,
          },
          trx,
        );
      }
    }
  }

  // ---- read + CRUD (request-scoped) ---------------------------------------

  async getJourney(req: AuthedRequest): Promise<JourneySummaryResponse> {
    const orgId = assertActiveOrg(req);
    const userId = req.user.id;
    const row = await this.progressionRepo.ensureRow(userId, orgId);
    const goals = await this.goalRepo.listForUser(userId, orgId);
    const quests = await this.loadQuestSummaries(userId, orgId);
    const unlockedCosmetics = await this.unlockRepo.listCosmeticIdsForUser(userId, orgId);
    const season = await this.loadSeasonDTO(userId, orgId, localDateString(row.streak_timezone ?? undefined));
    const settings = await this.settingsRepo.findByUserId(userId);
    const prog = levelProgress(row.xp);
    const dto: JourneySummaryDTO = {
      xp: row.xp,
      level: prog.level,
      xpIntoLevel: prog.xpIntoLevel,
      xpForNextLevel: prog.xpForNextLevel,
      streak: {
        current: row.current_streak,
        longest: row.longest_streak,
        lastActiveDate: toDayString(row.last_active_date),
        graceRemaining: row.streak_grace_remaining,
        freezes: row.streak_freezes,
      },
      avatarState: row.avatar_state ?? {},
      unlockedCosmetics,
      goals: goals.map((g) => this.mapGoal(g)),
      quests,
      season,
      leaderboardOptIn: settings?.leaderboard_opt_in ?? false,
      milestones: {
        habitEstablished: {
          level: HABIT_ESTABLISHED_LEVEL,
          reached: prog.level >= HABIT_ESTABLISHED_LEVEL,
        },
      },
    };
    return new JourneySummaryResponse({ data: dto });
  }

  /** Equip avatar cosmetics. Validates each against the user's level AND earned
   *  unlocks (seasonal rewards), stores the equipped map, returns the fresh journey. */
  async updateAvatar(req: AuthedRequest, body: UpdateAvatarBody): Promise<JourneySummaryResponse> {
    const orgId = assertActiveOrg(req);
    const userId = req.user.id;
    const row = await this.progressionRepo.ensureRow(userId, orgId);
    const unlocked = new Set(await this.unlockRepo.listCosmeticIdsForUser(userId, orgId));
    const result = validateEquip(body.equipped ?? {}, levelForXp(row.xp), unlocked);
    if (!result.ok) throw new BadRequestException(result.reason);
    await this.progressionRepo.updateAvatarState(userId, orgId, { equipped: result.equipped });
    return this.getJourney(req);
  }

  // ---- Phase 3: seasons + leaderboard -------------------------------------

  /** The active season + the user's points + reward ladder (earned/next). Null
   *  when no season is in window. Shared by getJourney + getSeason. */
  private async loadSeasonDTO(userId: string, orgId: string, today: string): Promise<SeasonDTO | null> {
    const season = await this.seasonRepo.findActive(today);
    if (!season) return null;
    const startsOn = toDayString(season.starts_on)!;
    const endsOn = toDayString(season.ends_on)!;
    const { points } = await this.eventRepo.seasonPoints(userId, orgId, startsOn, endsOn);
    return this.buildSeasonDTO(season, points, today);
  }

  private buildSeasonDTO(season: Season, points: number, today: string): SeasonDTO {
    const startsOn = toDayString(season.starts_on)!;
    const endsOn = toDayString(season.ends_on)!;
    return {
      id: season.id,
      slug: season.slug,
      name: season.name,
      theme: season.theme,
      startsOn,
      endsOn,
      daysRemaining: Math.max(0, daysBetween(today, endsOn)),
      points,
      rewards: ladderForTheme(season.theme).map((r) => ({
        cosmeticId: r.cosmeticId,
        pointsThreshold: r.pointsThreshold,
        earned: points >= r.pointsThreshold,
      })),
    };
  }

  async getSeason(req: AuthedRequest): Promise<SeasonResponse> {
    const orgId = assertActiveOrg(req);
    const row = await this.progressionRepo.ensureRow(req.user.id, orgId);
    const season = await this.loadSeasonDTO(req.user.id, orgId, localDateString(row.streak_timezone ?? undefined));
    return new SeasonResponse({ data: season });
  }

  /**
   * Cohort leaderboard — coach-group only, effort-based (season points),
   * reciprocal opt-in. The viewer must be opted in to see anything; only opted-in
   * cohort members appear; ranking is on season points (tie-break active days).
   * Privacy names only ("Jane D."); no performance metrics ever.
   */
  async getLeaderboard(req: AuthedRequest): Promise<LeaderboardResponse> {
    const orgId = assertActiveOrg(req);
    const userId = req.user.id;

    const mySettings = await this.settingsRepo.findByUserId(userId);
    if (!mySettings?.leaderboard_opt_in) {
      return new LeaderboardResponse({ data: { optedIn: false, entries: [] } });
    }

    const row = await this.progressionRepo.ensureRow(userId, orgId);
    const today = localDateString(row.streak_timezone ?? undefined);
    const season = await this.seasonRepo.findActive(today);
    // No active season → no window to rank over; show just the viewer.
    const windowStart = season ? toDayString(season.starts_on)! : today;
    const windowEnd = season ? toDayString(season.ends_on)! : today;

    // Cohort = the viewer's coach's active roster (incl. the viewer). No coach →
    // just the viewer (a friendly "solo" board). Always org-scoped.
    const cohortIds = await this.resolveCohort(userId, orgId);

    // Keep only opted-in members (reciprocal). Single settings lookup per member.
    const optedIn: string[] = [];
    for (const id of cohortIds) {
      if (id === userId) {
        optedIn.push(id);
        continue;
      }
      const s = await this.settingsRepo.findByUserId(id);
      if (s?.leaderboard_opt_in) optedIn.push(id);
    }

    const pointsMap = await this.eventRepo.seasonPointsForUsers(optedIn, orgId, windowStart, windowEnd);
    const users = await this.userRepo.findByIds(optedIn);
    const nameById = new Map(users.map((u) => [u.id, privacyName(u)]));

    const entries: LeaderboardEntryDTO[] = optedIn
      .map((id) => {
        const stats = pointsMap.get(id) ?? { points: 0, activeDays: 0 };
        return {
          userId: id,
          name: nameById.get(id) ?? 'Member',
          points: stats.points,
          activeDays: stats.activeDays,
          isMe: id === userId,
          rank: 0,
        };
      })
      .sort((a, b) => b.points - a.points || b.activeDays - a.activeDays)
      .map((e, i) => ({ ...e, rank: i + 1 }));

    return new LeaderboardResponse({ data: { optedIn: true, entries } });
  }

  /** Cohort user ids for a viewer: their primary coach's active roster (+ self),
   *  else just the viewer. Always within the active org. */
  private async resolveCohort(userId: string, orgId: string): Promise<string[]> {
    const ids = new Set<string>([userId]);
    const myCoach = await this.relationshipRepo.findActiveByAthleteId(userId);
    if (myCoach) {
      const roster = await this.relationshipRepo.findMany({
        organisationId: orgId,
        coachId: myCoach.coach_id,
        status: CoachAthleteStatus.ACTIVE,
      });
      for (const r of roster) ids.add(r.athlete_id);
    }
    return [...ids];
  }

  async listGoals(req: AuthedRequest): Promise<GoalListResponse> {
    const orgId = assertActiveOrg(req);
    const goals = await this.goalRepo.listForUser(req.user.id, orgId);
    return new GoalListResponse({ data: goals.map((g) => this.mapGoal(g)) });
  }

  /** The athlete's active quests (coach-assigned) for the Journey tab. */
  async listMyQuests(req: AuthedRequest): Promise<QuestListResponse> {
    const orgId = assertActiveOrg(req);
    return new QuestListResponse({ data: await this.loadQuestSummaries(req.user.id, orgId) });
  }

  private async loadQuestSummaries(userId: string, orgId: string): Promise<QuestSummaryDTO[]> {
    const rows = await this.questAssignmentRepo.listActiveForUserWithQuest(userId, orgId);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      objectiveType: r.objectiveType,
      targetValue: r.targetValue,
      progressValue: r.progressValue,
      rewardXp: r.rewardXp,
      period: r.period,
      status: r.status,
      windowEnd: toDayString(r.windowEnd),
    }));
  }

  /**
   * Read-only recap: aggregate the XP ledger over a rolling window plus the
   * goals/quests completed in it. No precompute — cheap enough on read.
   */
  async getRecap(req: AuthedRequest, query: RecapQuery): Promise<RecapResponse> {
    const orgId = assertActiveOrg(req);
    const userId = req.user.id;
    const period = query.period ?? 'week';
    const days = period === 'month' ? 30 : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [agg, goalsCompleted, questsCompleted] = await Promise.all([
      this.eventRepo.aggregateSince(userId, orgId, since),
      this.goalRepo.countCompletedSince(userId, orgId, since),
      this.questAssignmentRepo.countCompletedSince(userId, orgId, since),
    ]);

    const dto: RecapDTO = {
      period,
      totalXp: agg.totalXp,
      workouts: agg.workouts,
      snacks: agg.snacks,
      activeDays: agg.activeDays,
      goalsCompleted,
      questsCompleted,
    };
    return new RecapResponse({ data: dto });
  }

  async createGoal(req: AuthedRequest, body: CreateGoalBody): Promise<GoalResponse> {
    const orgId = assertActiveOrg(req);
    if (body.goalType === UserGoalType.CUSTOM && !body.title?.trim()) {
      throw new BadRequestException('A custom goal needs a title.');
    }
    const row = await this.goalRepo.create({
      user_id: req.user.id,
      organisation_id: orgId,
      goal_type: body.goalType,
      title: body.title?.trim() ?? null,
      target_value: body.targetValue,
      unit: body.unit?.trim() ?? null,
      period: body.period ?? UserGoalPeriod.ONGOING,
    });
    return new GoalResponse({ data: this.mapGoal(row) });
  }

  async updateGoal(req: AuthedRequest, id: string, body: UpdateGoalBody): Promise<GoalResponse> {
    const orgId = assertActiveOrg(req);
    const userId = req.user.id;
    const existing = await this.goalRepo.findByIdForUser(id, userId, orgId);
    if (!existing) throw new NotFoundException('Goal not found.');

    const patch: UserGoalUpdate = {};
    if (body.targetValue !== undefined) patch.target_value = body.targetValue;
    if (body.title !== undefined) patch.title = body.title.trim() || null;
    if (body.status !== undefined) {
      patch.status = body.status;
      patch.completed_at = body.status === UserGoalStatus.COMPLETED ? new Date() : null;
    }
    // current_value is server-managed for system goals; only custom goals
    // accept a manual value.
    if (body.currentValue !== undefined && existing.goal_type === UserGoalType.CUSTOM) {
      patch.current_value = body.currentValue;
    }

    const row = await this.goalRepo.updateForUser(id, userId, orgId, patch);
    if (!row) throw new NotFoundException('Goal not found.');
    return new GoalResponse({ data: this.mapGoal(row) });
  }

  async deleteGoal(req: AuthedRequest, id: string): Promise<void> {
    const orgId = assertActiveOrg(req);
    const userId = req.user.id;
    const existing = await this.goalRepo.findByIdForUser(id, userId, orgId);
    if (!existing) throw new NotFoundException('Goal not found.');
    await this.goalRepo.updateForUser(id, userId, orgId, { status: UserGoalStatus.ARCHIVED });
  }

  private mapGoal(g: UserGoal): GoalDTO {
    return {
      id: g.id,
      goalType: g.goal_type,
      title: g.title,
      targetValue: g.target_value,
      currentValue: g.current_value,
      unit: g.unit,
      period: g.period,
      status: g.status,
      completedAt: iso(g.completed_at),
      createdAt: iso(g.created_at) ?? '',
    };
  }
}

/** Today's calendar date ('YYYY-MM-DD') in the given IANA tz, else UTC. */
function localDateString(tz?: string): string {
  const now = new Date();
  if (tz) {
    try {
      // en-CA formats as YYYY-MM-DD.
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
    } catch {
      // invalid tz — fall through to UTC
    }
  }
  return now.toISOString().slice(0, 10);
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Whole days from `from` to `to` (both 'YYYY-MM-DD'); negative if `to` is past. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/** Privacy-safe leaderboard name: "Jane D." → "Jane" → display_name → "Member". */
function privacyName(u: { display_name: string | null; first_name: string | null; last_name: string | null }): string {
  const first = u.first_name?.trim();
  const lastInitial = u.last_name?.trim()?.[0];
  if (first) return lastInitial ? `${first} ${lastInitial}.` : first;
  const display = u.display_name?.trim();
  if (display) {
    const [d0, d1] = display.split(/\s+/);
    return d1 ? `${d0} ${d1[0]}.` : d0;
  }
  return 'Member';
}
