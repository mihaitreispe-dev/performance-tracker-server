import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import {
  CoachAthleteStatus,
  CoachScheduledPrompt,
  NotificationType,
  ScheduledPromptType,
  ScheduleFrequency,
  User,
} from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { CoachScheduledPromptRepository } from 'src/repositories/coach-scheduled-prompt.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { NotificationsApiService } from '../../notifications/notifications-api.service';
import { UserBasicDTO } from '../response.dto';
import { CreateScheduledPromptBody, ListScheduledPromptsQuery, UpdateScheduledPromptBody } from './request.dto';
import {
  ScheduledPromptDTO,
  ScheduledPromptListResponse,
  ScheduledPromptResponse,
  SendNowResponse,
} from './response.dto';

@Injectable()
export class ScheduledPromptsService {
  constructor(
    private readonly promptRepo: CoachScheduledPromptRepository,
    private readonly relationshipRepo: CoachAthleteRelationshipRepository,
    private readonly userRepo: UserRepository,
    private readonly notificationsService: NotificationsApiService,
  ) {}

  async create(req: Request & { user: AuthUser }, body: CreateScheduledPromptBody): Promise<ScheduledPromptResponse> {
    const coachId = req.user.id;

    // Validate athlete relationship if targeting specific athlete
    if (body.athleteId) {
      const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(coachId, body.athleteId);
      if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
        throw new BadRequestException('No active coaching relationship with this athlete');
      }
    }

    // Validate days_of_week for specific_days frequency
    if (body.frequency === ScheduleFrequency.SPECIFIC_DAYS) {
      if (!body.daysOfWeek || body.daysOfWeek.length === 0) {
        throw new BadRequestException('daysOfWeek is required for specific_days frequency');
      }
    }

    // Calculate next run time
    const nextRunAt = this.calculateNextRunAt(
      body.frequency,
      body.scheduledTime,
      body.timezone,
      body.startDate,
      body.daysOfWeek,
    );

    const prompt = await this.promptRepo.create({
      coach_id: coachId,
      athlete_id: body.athleteId || null,
      prompt_type: body.promptType,
      title: body.title,
      message: body.message || null,
      frequency: body.frequency,
      days_of_week: body.daysOfWeek || null,
      scheduled_time: body.scheduledTime + ':00', // Add seconds
      timezone: body.timezone,
      start_date: body.startDate,
      end_date: body.endDate || null,
      next_run_at: nextRunAt,
    });

    // Fetch athlete details if targeting specific athlete
    let athlete: User | undefined;
    if (prompt.athlete_id) {
      athlete = await this.userRepo.findById(prompt.athlete_id);
    }

    return {
      data: this.mapToDTO(prompt, athlete),
    };
  }

  async list(
    req: Request & { user: AuthUser },
    query: ListScheduledPromptsQuery,
  ): Promise<ScheduledPromptListResponse> {
    const coachId = req.user.id;

    const prompts = await this.promptRepo.findByCoachId(
      coachId,
      {
        athleteId: query.athleteId,
        promptType: query.promptType,
        enabled: query.enabled,
      },
      {
        limit: query.limit,
        offset: query.offset,
      },
    );

    const total = await this.promptRepo.countByCoachId(coachId, {
      athleteId: query.athleteId,
      promptType: query.promptType,
      enabled: query.enabled,
    });

    // Batch fetch athlete details
    const athleteIds = [...new Set(prompts.filter((p) => p.athlete_id).map((p) => p.athlete_id!))];
    const athletes = await this.userRepo.findByIds(athleteIds);
    const athleteMap = new Map(athletes.map((a) => [a.id, a]));

    return {
      data: prompts.map((p) => this.mapToDTO(p, p.athlete_id ? athleteMap.get(p.athlete_id) : undefined)),
      total,
    };
  }

  async getById(req: Request & { user: AuthUser }, id: string): Promise<ScheduledPromptResponse> {
    const prompt = await this.promptRepo.findById(id);
    if (!prompt) {
      throw new NotFoundException('Scheduled prompt not found');
    }

    if (prompt.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only access your own scheduled prompts');
    }

    let athlete: User | undefined;
    if (prompt.athlete_id) {
      athlete = await this.userRepo.findById(prompt.athlete_id);
    }

    return {
      data: this.mapToDTO(prompt, athlete),
    };
  }

  async update(
    req: Request & { user: AuthUser },
    id: string,
    body: UpdateScheduledPromptBody,
  ): Promise<ScheduledPromptResponse> {
    const prompt = await this.promptRepo.findById(id);
    if (!prompt) {
      throw new NotFoundException('Scheduled prompt not found');
    }

    if (prompt.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only update your own scheduled prompts');
    }

    // Validate new athlete relationship if changing target
    if (body.athleteId !== undefined && body.athleteId !== null) {
      const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(req.user.id, body.athleteId);
      if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
        throw new BadRequestException('No active coaching relationship with this athlete');
      }
    }

    // Determine if schedule parameters changed
    const newFrequency = body.frequency ?? prompt.frequency;
    const newScheduledTime = body.scheduledTime ?? prompt.scheduled_time.substring(0, 5);
    const newTimezone = body.timezone ?? prompt.timezone;
    const newStartDate = body.startDate ?? prompt.start_date;
    const newDaysOfWeek = body.daysOfWeek !== undefined ? body.daysOfWeek : prompt.days_of_week;

    // Validate days_of_week for specific_days frequency
    if (newFrequency === ScheduleFrequency.SPECIFIC_DAYS) {
      if (!newDaysOfWeek || newDaysOfWeek.length === 0) {
        throw new BadRequestException('daysOfWeek is required for specific_days frequency');
      }
    }

    // Recalculate next_run_at if schedule changed
    const scheduleChanged =
      body.frequency !== undefined ||
      body.scheduledTime !== undefined ||
      body.timezone !== undefined ||
      body.startDate !== undefined ||
      body.daysOfWeek !== undefined;

    let nextRunAt = prompt.next_run_at;
    if (scheduleChanged) {
      nextRunAt = this.calculateNextRunAt(newFrequency, newScheduledTime, newTimezone, newStartDate, newDaysOfWeek);
    }

    const updateData: Record<string, unknown> = {};
    if (body.athleteId !== undefined) updateData.athlete_id = body.athleteId;
    if (body.promptType !== undefined) updateData.prompt_type = body.promptType;
    if (body.title !== undefined) updateData.title = body.title;
    if (body.message !== undefined) updateData.message = body.message;
    if (body.frequency !== undefined) updateData.frequency = body.frequency;
    if (body.daysOfWeek !== undefined) updateData.days_of_week = body.daysOfWeek;
    if (body.scheduledTime !== undefined) updateData.scheduled_time = body.scheduledTime + ':00';
    if (body.timezone !== undefined) updateData.timezone = body.timezone;
    if (body.startDate !== undefined) updateData.start_date = body.startDate;
    if (body.endDate !== undefined) updateData.end_date = body.endDate;
    if (scheduleChanged) updateData.next_run_at = nextRunAt;

    const updated = await this.promptRepo.updateById(id, updateData);
    if (!updated) {
      throw new NotFoundException('Scheduled prompt not found');
    }

    let athlete: User | undefined;
    if (updated.athlete_id) {
      athlete = await this.userRepo.findById(updated.athlete_id);
    }

    return {
      data: this.mapToDTO(updated, athlete),
    };
  }

  async delete(req: Request & { user: AuthUser }, id: string): Promise<void> {
    const prompt = await this.promptRepo.findById(id);
    if (!prompt) {
      throw new NotFoundException('Scheduled prompt not found');
    }

    if (prompt.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only delete your own scheduled prompts');
    }

    await this.promptRepo.deleteById(id);
  }

  async enable(req: Request & { user: AuthUser }, id: string): Promise<ScheduledPromptResponse> {
    const prompt = await this.promptRepo.findById(id);
    if (!prompt) {
      throw new NotFoundException('Scheduled prompt not found');
    }

    if (prompt.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only enable your own scheduled prompts');
    }

    // Recalculate next_run_at when re-enabling
    const nextRunAt = this.calculateNextRunAt(
      prompt.frequency,
      prompt.scheduled_time.substring(0, 5),
      prompt.timezone,
      prompt.start_date,
      prompt.days_of_week,
    );

    const updated = await this.promptRepo.updateById(id, {
      enabled: true,
      next_run_at: nextRunAt,
    });

    let athlete: User | undefined;
    if (updated?.athlete_id) {
      athlete = await this.userRepo.findById(updated.athlete_id);
    }

    return {
      data: this.mapToDTO(updated!, athlete),
    };
  }

  async disable(req: Request & { user: AuthUser }, id: string): Promise<ScheduledPromptResponse> {
    const prompt = await this.promptRepo.findById(id);
    if (!prompt) {
      throw new NotFoundException('Scheduled prompt not found');
    }

    if (prompt.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only disable your own scheduled prompts');
    }

    const updated = await this.promptRepo.disable(id);

    let athlete: User | undefined;
    if (updated?.athlete_id) {
      athlete = await this.userRepo.findById(updated.athlete_id);
    }

    return {
      data: this.mapToDTO(updated!, athlete),
    };
  }

  async sendNow(req: Request & { user: AuthUser }, id: string): Promise<SendNowResponse> {
    const prompt = await this.promptRepo.findById(id);
    if (!prompt) {
      throw new NotFoundException('Scheduled prompt not found');
    }

    if (prompt.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only send your own scheduled prompts');
    }

    // Get target athletes
    const athleteIds = await this.getTargetAthleteIds(prompt);
    if (athleteIds.length === 0) {
      return {
        data: {
          notificationsSent: 0,
          athleteIds: [],
        },
      };
    }

    // Get coach info for notification
    const coach = await this.userRepo.findById(prompt.coach_id);
    const coachName = coach?.display_name || coach?.email || 'Your coach';

    // Determine notification type based on prompt type
    const notificationType = this.getNotificationTypeForPrompt(prompt.prompt_type);

    // Create notifications
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

    return {
      data: {
        notificationsSent: athleteIds.length,
        athleteIds,
      },
    };
  }

  /**
   * Get target athlete IDs for a prompt
   */
  async getTargetAthleteIds(prompt: CoachScheduledPrompt): Promise<string[]> {
    if (prompt.athlete_id) {
      // Verify relationship is still active
      const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(prompt.coach_id, prompt.athlete_id);
      if (relationship && relationship.status === CoachAthleteStatus.ACTIVE) {
        return [prompt.athlete_id];
      }
      return [];
    }

    // Get all active athletes for this coach
    const relationships = await this.relationshipRepo.findMany({
      coachId: prompt.coach_id,
      status: [CoachAthleteStatus.ACTIVE],
    });

    return relationships.map((r) => r.athlete_id);
  }

  /**
   * Get notification type based on prompt type
   */
  getNotificationTypeForPrompt(promptType: ScheduledPromptType): NotificationType {
    switch (promptType) {
      case ScheduledPromptType.INTAKE_REMINDER:
        return NotificationType.INTAKE_REMINDER;
      case ScheduledPromptType.CHECK_IN_REQUEST:
        return NotificationType.CHECK_IN_REQUEST;
      case ScheduledPromptType.WORKOUT_NOTE_REQUEST:
        return NotificationType.WORKOUT_NOTE_REQUEST;
      case ScheduledPromptType.CUSTOM_PROMPT:
      default:
        return NotificationType.SCHEDULED_PROMPT;
    }
  }

  /**
   * Calculate the next run time for a scheduled prompt
   * Takes into account timezone, frequency, and days of week
   */
  calculateNextRunAt(
    frequency: ScheduleFrequency,
    scheduledTime: string, // HH:MM
    timezone: string,
    startDate: string, // YYYY-MM-DD
    daysOfWeek?: number[] | null,
  ): Date {
    const now = new Date();

    // Parse the scheduled time
    const [hours, minutes] = scheduledTime.split(':').map(Number);

    // Create a date for today at the scheduled time in the target timezone
    const todayAtScheduledTime = this.createDateInTimezone(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hours,
      minutes,
      timezone,
    );

    // Parse start date
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const startDateObj = this.createDateInTimezone(startYear, startMonth - 1, startDay, hours, minutes, timezone);

    // Start from the later of now or start date
    let candidateDate = startDateObj > now ? new Date(startDateObj) : new Date(todayAtScheduledTime);

    // If candidate is in the past, move to next occurrence
    if (candidateDate <= now) {
      candidateDate = this.addDays(candidateDate, 1);
    }

    if (frequency === ScheduleFrequency.ONCE) {
      // For one-time prompts, use the start date at the scheduled time
      return startDateObj > now ? startDateObj : candidateDate;
    }

    if (frequency === ScheduleFrequency.DAILY) {
      // Next occurrence is the next day at the scheduled time if today already passed
      return candidateDate;
    }

    if (frequency === ScheduleFrequency.WEEKLY) {
      // Find the next occurrence on the same day of the week as start date
      const startDayOfWeek = new Date(startDateObj).getDay();
      while (candidateDate.getDay() !== startDayOfWeek || candidateDate <= now) {
        candidateDate = this.addDays(candidateDate, 1);
      }
      return candidateDate;
    }

    if (frequency === ScheduleFrequency.SPECIFIC_DAYS) {
      if (!daysOfWeek || daysOfWeek.length === 0) {
        throw new Error('daysOfWeek is required for specific_days frequency');
      }
      // Find the next occurrence on one of the specified days
      const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
      for (let i = 0; i < 8; i++) {
        const checkDate = this.addDays(candidateDate, i);
        const dayOfWeek = checkDate.getDay();
        if (sortedDays.includes(dayOfWeek) && checkDate > now) {
          return checkDate;
        }
      }
      // Fallback: just return next week's first matching day
      return this.addDays(candidateDate, 7);
    }

    return candidateDate;
  }

  /**
   * Create a Date object for a specific time in a timezone
   */
  private createDateInTimezone(
    year: number,
    month: number,
    day: number,
    hours: number,
    minutes: number,
    timezone: string,
  ): Date {
    // Create a date string in the format that represents the local time
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

    // Get the offset for this timezone at this date/time
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Create a temporary date to get timezone offset
    const tempDate = new Date(dateStr);
    const parts = formatter.formatToParts(tempDate);
    const tzParts: Record<string, string> = {};
    parts.forEach((p) => {
      tzParts[p.type] = p.value;
    });

    // Calculate the difference between UTC and target timezone
    const utcDate = new Date(Date.UTC(year, month, day, hours, minutes, 0));
    const tzDateStr = `${tzParts.year}-${tzParts.month}-${tzParts.day}T${tzParts.hour}:${tzParts.minute}:${tzParts.second}Z`;
    const tzDate = new Date(tzDateStr);

    // The offset is the difference
    const offsetMs = tempDate.getTime() - tzDate.getTime();

    // Return the UTC time that corresponds to the local time in the target timezone
    return new Date(utcDate.getTime() - offsetMs);
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private mapToDTO(prompt: CoachScheduledPrompt, athlete?: User): ScheduledPromptDTO {
    const nextRunAt =
      prompt.next_run_at instanceof Date ? prompt.next_run_at.toISOString() : String(prompt.next_run_at);

    const lastSentAt = prompt.last_sent_at
      ? prompt.last_sent_at instanceof Date
        ? prompt.last_sent_at.toISOString()
        : String(prompt.last_sent_at)
      : null;

    const createdAt = prompt.created_at instanceof Date ? prompt.created_at.toISOString() : String(prompt.created_at);

    const updatedAt = prompt.updated_at instanceof Date ? prompt.updated_at.toISOString() : String(prompt.updated_at);

    return {
      id: prompt.id,
      coachId: prompt.coach_id,
      athleteId: prompt.athlete_id,
      athlete: athlete ? this.mapToUserBasicDTO(athlete) : null,
      promptType: prompt.prompt_type,
      title: prompt.title,
      message: prompt.message,
      frequency: prompt.frequency,
      daysOfWeek: prompt.days_of_week,
      scheduledTime: prompt.scheduled_time.substring(0, 5), // Remove seconds
      timezone: prompt.timezone,
      startDate: prompt.start_date,
      endDate: prompt.end_date,
      nextRunAt,
      lastSentAt,
      enabled: prompt.enabled,
      createdAt,
      updatedAt,
    };
  }

  private mapToUserBasicDTO(user: User): UserBasicDTO {
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      firstName: user.first_name,
      lastName: user.last_name,
      picture: null,
    };
  }
}
