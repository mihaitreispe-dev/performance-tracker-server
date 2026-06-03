import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import parser from 'cron-parser';

import { NotificationRuleTriggerType } from 'src/database/interfaces';
import { NotificationRuleRepository } from 'src/repositories/notification-rule.repository';

import { NotificationRulesService } from './notification-rules.service';

/**
 * Minute-resolution cron driver for time-based notification rules.
 *
 * Runs once per minute. For each enabled rule with a `recurring` or
 * `on_daily_schedule` trigger, parses the rule's cron expression and
 * checks whether the previous fire moment falls inside the current
 * tick's [tickStart, tickEnd) window. If yes, dispatches the rule.
 *
 * "Previous fire" matching, not "next fire matches now": cron-parser
 * gives us the most-recent fire time as `.prev()`. Comparing it to
 * the tick window is robust to a tick that runs a few seconds late.
 *
 * The dispatcher's dedupe window (50s) handles a tick re-run inside
 * the same minute — re-firing the same rule for the same user is a
 * no-op.
 */
@Injectable()
export class NotificationRulesCronService {
  private readonly logger = new Logger(NotificationRulesCronService.name);
  // Track the last tick's start so we can use a tight window even if
  // the cron interval drifts. First-run defaults to (now - 60s, now].
  private lastTickAt: Date = new Date(Date.now() - 60_000);

  constructor(
    private readonly ruleRepo: NotificationRuleRepository,
    private readonly engine: NotificationRulesService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    const tickEnd = new Date();
    const tickStart = this.lastTickAt;
    this.lastTickAt = tickEnd;

    const rules = await this.ruleRepo.listEnabledByTrigger([
      NotificationRuleTriggerType.RECURRING,
      NotificationRuleTriggerType.ON_DAILY_SCHEDULE,
    ]);
    if (rules.length === 0) return;

    let fired = 0;
    for (const rule of rules) {
      if (!rule.cron_expression) continue;
      try {
        // .prev() returns the most recent fire moment ≤ now. If it
        // falls inside this tick's window, we fire.
        const interval = parser.parseExpression(rule.cron_expression, {
          currentDate: tickEnd,
        });
        const prev = interval.prev().toDate();
        if (prev > tickStart && prev <= tickEnd) {
          await this.engine.dispatchOne(rule);
          fired += 1;
        }
      } catch (err) {
        // Malformed cron expression — log + skip; don't poison the
        // tick. The admin UI validates on save but rules predating
        // validation could be invalid.
        this.logger.warn(
          `Rule ${rule.id} cron parse failed: ${(err as Error).message}`,
        );
      }
    }
    if (fired > 0) {
      this.logger.log(`Notification cron tick fired ${fired}/${rules.length} rules`);
    }
  }

  /**
   * Daily plan-adherence sweep. Runs once a day at 09:00 server-time.
   * For every enabled on_plan_adherence rule, finds athletes in the
   * rule's audience with ≥ minMissed scheduled workouts in the last
   * windowDays (defaults 7d / 1 missed) and fires the rule for each.
   *
   * Engine handles the per-user dedupe with a 24h window so a sweep
   * re-run (admin retry, deploy-time double-tick) doesn't ping the
   * same athlete twice the same day.
   */
  @Cron('0 9 * * *')
  async planAdherenceSweep(): Promise<void> {
    const { fired } = await this.engine.runPlanAdherenceSweep();
    if (fired > 0) {
      this.logger.log(`Plan-adherence sweep fired ${fired} notifications`);
    }
  }
}
