import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CoachScheduledPrompt, ScheduleFrequency } from 'src/database/interfaces';
import { ScheduledPromptsService } from 'src/modules/api/v1/coaching/scheduled-prompts/scheduled-prompts.service';
import { NotificationsApiService } from 'src/modules/api/v1/notifications/notifications-api.service';
import { CoachScheduledPromptRepository } from 'src/repositories/coach-scheduled-prompt.repository';
import { UserRepository } from 'src/repositories/user.repository';

@Injectable()
export class ScheduledPromptsCronService {
  private readonly logger = new Logger(ScheduledPromptsCronService.name);

  constructor(
    private readonly promptRepo: CoachScheduledPromptRepository,
    private readonly userRepo: UserRepository,
    private readonly promptsService: ScheduledPromptsService,
    private readonly notificationsService: NotificationsApiService,
  ) {}

  /**
   * Process scheduled prompts every minute
   * Finds due prompts and sends notifications to target athletes
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledPrompts() {
    const now = new Date();

    try {
      // Find all due prompts (enabled and next_run_at <= now)
      const duePrompts = await this.promptRepo.findDuePrompts(now);

      if (duePrompts.length === 0) {
        return;
      }

      this.logger.log(`Processing ${duePrompts.length} due scheduled prompts`);

      for (const prompt of duePrompts) {
        try {
          await this.processPrompt(prompt, now);
        } catch (error) {
          this.logger.error(`Failed to process scheduled prompt ${prompt.id}`, error);
        }
      }
    } catch (error) {
      this.logger.error('Failed to process scheduled prompts', error);
    }
  }

  private async processPrompt(prompt: CoachScheduledPrompt, now: Date): Promise<void> {
    // Check if end_date has passed
    if (prompt.end_date) {
      const endDate = new Date(prompt.end_date + 'T23:59:59Z');
      if (now > endDate) {
        this.logger.log(`Disabling expired prompt ${prompt.id} (end_date: ${prompt.end_date})`);
        await this.promptRepo.disable(prompt.id);
        return;
      }
    }

    // Get target athletes
    const athleteIds = await this.promptsService.getTargetAthleteIds(prompt);

    if (athleteIds.length === 0) {
      this.logger.warn(`No active athletes found for prompt ${prompt.id}`);
      // Still update next_run_at to avoid repeatedly processing
      await this.updateNextRunOrDisable(prompt, now);
      return;
    }

    // Get coach info for notification
    const coach = await this.userRepo.findById(prompt.coach_id);
    const coachName = coach?.display_name || coach?.email || 'Your coach';

    // Determine notification type
    const notificationType = this.promptsService.getNotificationTypeForPrompt(prompt.prompt_type);

    // Create notifications for all target athletes
    const notifications = athleteIds.map((athleteId) => ({
      userId: athleteId,
      type: notificationType,
      title: prompt.title,
      body: prompt.message || undefined,
      data: {
        coachId: prompt.coach_id,
        scheduledPromptId: prompt.id,
        promptType: prompt.prompt_type,
        senderName: coachName,
      },
    }));

    await this.notificationsService.createNotifications(notifications);

    this.logger.log(`Sent ${notifications.length} notifications for prompt ${prompt.id} (type: ${prompt.prompt_type})`);

    // Update next_run_at or disable if one-time
    await this.updateNextRunOrDisable(prompt, now);
  }

  private async updateNextRunOrDisable(prompt: CoachScheduledPrompt, now: Date): Promise<void> {
    // For one-time prompts, disable after sending
    if (prompt.frequency === ScheduleFrequency.ONCE) {
      this.logger.log(`Disabling one-time prompt ${prompt.id}`);
      await this.promptRepo.updateById(prompt.id, {
        enabled: false,
        last_sent_at: now,
      });
      return;
    }

    // Calculate next run time
    const nextRunAt = this.promptsService.calculateNextRunAt(
      prompt.frequency,
      prompt.scheduled_time.substring(0, 5), // Remove seconds
      prompt.timezone,
      prompt.start_date,
      prompt.days_of_week,
    );

    // Check if next run would be after end_date
    if (prompt.end_date) {
      const endDate = new Date(prompt.end_date + 'T23:59:59Z');
      if (nextRunAt > endDate) {
        this.logger.log(`Disabling prompt ${prompt.id} as next run would be after end_date`);
        await this.promptRepo.updateById(prompt.id, {
          enabled: false,
          last_sent_at: now,
        });
        return;
      }
    }

    // Update next_run_at and last_sent_at
    await this.promptRepo.updateNextRunAt(prompt.id, nextRunAt, now);
    this.logger.debug(`Updated prompt ${prompt.id} next_run_at to ${nextRunAt.toISOString()}`);
  }
}
