import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Kysely } from 'kysely';

import {
  Database,
  ProgressionSourceType,
  QuestObjectiveType,
  QuestPeriod,
  QuestStatus,
} from 'src/database/interfaces';
import {
  applyFreezeEarnings,
  levelForXp,
  toDayString,
} from 'src/modules/api/v1/progression/progression.math';
import { currentWeekWindow, todayString } from 'src/modules/api/v1/progression/quest-window';
import { KYSELY_ROOT } from 'src/modules/database/database.module';
import { QuestAssignmentRepository } from 'src/repositories/quest-assignment.repository';
import { QuestRepository } from 'src/repositories/quest.repository';
import { UserProgressionEventRepository } from 'src/repositories/user-progression-event.repository';
import { UserProgressionRepository } from 'src/repositories/user-progression.repository';

/**
 * Drives the time-derived side of coach-authored quests. Activity-driven
 * progress is bumped in real time in ProgressionApiService.award(); this cron
 * owns:
 *   1. state-derived evaluation (streak_reached / level_reached),
 *   2. completion + reward XP (exactly-once via the user_progression_events
 *      ledger; the SOLE place reward XP is paid),
 *   3. one-off expiry + weekly window roll.
 * Runs RLS-bypassed (root connection, no app.current_org) like the other
 * cross-tenant cron jobs. Each step + row is independently try/caught.
 */
@Injectable()
export class QuestsCronService {
  private readonly logger = new Logger(QuestsCronService.name);

  constructor(
    @Inject(KYSELY_ROOT) private readonly root: Kysely<Database>,
    private readonly questRepo: QuestRepository,
    private readonly assignmentRepo: QuestAssignmentRepository,
    private readonly progressionRepo: UserProgressionRepository,
    private readonly eventRepo: UserProgressionEventRepository,
  ) {}

  @Cron('0 4 * * *')
  async syncQuests(): Promise<void> {
    try {
      await this.evaluateStateObjectives();
    } catch (e) {
      this.logger.error(`Quest state evaluation failed: ${String(e)}`);
    }
    try {
      await this.completeAndReward();
    } catch (e) {
      this.logger.error(`Quest completion failed: ${String(e)}`);
    }
    try {
      await this.expireAndRoll();
    } catch (e) {
      this.logger.error(`Quest expiry/roll failed: ${String(e)}`);
    }
  }

  /** streak_reached / level_reached read the current state into progress_value. */
  private async evaluateStateObjectives(): Promise<void> {
    for (const objective of [QuestObjectiveType.STREAK_REACHED, QuestObjectiveType.LEVEL_REACHED]) {
      const assignments = await this.assignmentRepo.listActiveByObjective(objective);
      for (const a of assignments) {
        const row = await this.progressionRepo.findByUserAndOrg(a.user_id, a.organisation_id);
        if (!row) continue;
        const value =
          objective === QuestObjectiveType.STREAK_REACHED ? row.current_streak : levelForXp(row.xp);
        await this.assignmentRepo.setProgress(a.id, value);
      }
    }
  }

  /** Mark reached quests completed and pay reward XP exactly once (ledger-gated). */
  private async completeAndReward(): Promise<void> {
    const completable = await this.assignmentRepo.listCompletable();
    for (const a of completable) {
      try {
        await this.root.transaction().execute(async (trx) => {
          const isNew = await this.eventRepo.insertIfNew(
            {
              userId: a.user_id,
              organisationId: a.organisation_id,
              sourceType: ProgressionSourceType.QUEST_REWARD,
              sourceId: a.id,
              xpAwarded: a.reward_xp,
              metadata: { questId: a.quest_id },
            },
            trx,
          );
          if (isNew && a.reward_xp > 0) {
            const row = await this.progressionRepo.ensureRow(a.user_id, a.organisation_id, trx);
            const oldLevel = levelForXp(row.xp);
            const xp = row.xp + a.reward_xp;
            const newLevel = levelForXp(xp);
            await this.progressionRepo.applyAward(
              {
                id: row.id,
                xp,
                level: newLevel,
                // reward XP must not touch the streak — preserve all streak fields.
                currentStreak: row.current_streak,
                longestStreak: row.longest_streak,
                lastActiveDate: toDayString(row.last_active_date),
                streakGraceRemaining: row.streak_grace_remaining,
                streakFreezes: applyFreezeEarnings(row.streak_freezes, oldLevel, newLevel),
                streakTimezone: row.streak_timezone,
              },
              trx,
            );
          }
          await this.assignmentRepo.markCompleted(a.id, trx);
        });
      } catch (e) {
        this.logger.error(`Quest completion for assignment ${a.id} failed: ${String(e)}`);
      }
    }
  }

  /** Expire ended one-offs; roll weekly windows into the current week. */
  private async expireAndRoll(): Promise<void> {
    const ended = await this.assignmentRepo.listEndedActive(todayString());
    for (const a of ended) {
      try {
        await this.assignmentRepo.markExpired(a.id);
        if (a.period !== QuestPeriod.WEEKLY) continue;
        const quest = await this.questRepo.findByIdInOrg(a.quest_id, a.organisation_id);
        if (!quest || quest.status !== QuestStatus.ACTIVE) continue;
        const week = currentWeekWindow();
        await this.assignmentRepo.assign({
          quest_id: quest.id,
          organisation_id: quest.organisation_id,
          user_id: a.user_id,
          assigned_by_coach_id: a.assigned_by_coach_id,
          objective_type: quest.objective_type,
          target_value: quest.target_value,
          reward_xp: quest.reward_xp,
          period: quest.period,
          window_start: week.start,
          window_end: week.end,
        });
      } catch (e) {
        this.logger.error(`Quest roll for assignment ${a.id} failed: ${String(e)}`);
      }
    }
  }
}
