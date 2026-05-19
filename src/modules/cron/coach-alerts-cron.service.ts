import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CoachAthleteStatus, NotificationType } from 'src/database/interfaces';
import { NotificationsApiService } from 'src/modules/api/v1/notifications/notifications-api.service';
import { AthleteIntakeRepository } from 'src/repositories/athlete-intake.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { PainLogRepository } from 'src/repositories/pain-log.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

interface AthleteInfo {
  id: string;
  displayName: string;
  coachId: string;
}

@Injectable()
export class CoachAlertsCronService {
  private readonly logger = new Logger(CoachAlertsCronService.name);

  // Track sent alerts to avoid duplicates (in-memory, resets on restart)
  private sentAlerts = new Map<string, Date>();
  private readonly ALERT_COOLDOWN_HOURS = 24;

  constructor(
    private readonly relationshipRepo: CoachAthleteRelationshipRepository,
    private readonly scheduleRepo: WorkoutScheduleRepository,
    private readonly painLogRepo: PainLogRepository,
    private readonly intakeRepo: AthleteIntakeRepository,
    private readonly userRepo: UserRepository,
    private readonly notificationsService: NotificationsApiService,
  ) {}

  /**
   * Run daily at 8 AM UTC to check for coach alerts
   */
  @Cron('0 8 * * *')
  async processCoachAlerts() {
    this.logger.log('Processing coach alerts...');

    try {
      // Get all active coach-athlete relationships grouped by coach (cron runs cross-tenant).
      const relationships = await this.relationshipRepo.findManyAcrossOrgs({
        status: CoachAthleteStatus.ACTIVE,
      });

      if (relationships.length === 0) {
        this.logger.log('No active coach-athlete relationships found');
        return;
      }

      // Group athletes by coach
      const coachAthletes = new Map<string, AthleteInfo[]>();
      for (const rel of relationships) {
        const athletes = coachAthletes.get(rel.coach_id) || [];
        const user = await this.userRepo.findById(rel.athlete_id);
        if (user) {
          athletes.push({
            id: rel.athlete_id,
            displayName: user.display_name || user.email,
            coachId: rel.coach_id,
          });
        }
        coachAthletes.set(rel.coach_id, athletes);
      }

      // Process alerts for each coach
      for (const [coachId, athletes] of coachAthletes) {
        await this.processAlertsForCoach(coachId, athletes);
      }

      this.logger.log('Coach alerts processing complete');
    } catch (error) {
      this.logger.error('Failed to process coach alerts', error);
    }
  }

  private async processAlertsForCoach(coachId: string, athletes: AthleteInfo[]): Promise<void> {
    const notifications: Array<{
      userId: string;
      type: NotificationType;
      title: string;
      body?: string;
      data?: Record<string, unknown>;
    }> = [];

    for (const athlete of athletes) {
      try {
        // Check for missed workouts
        const missedWorkout = await this.checkMissedWorkouts(athlete);
        if (missedWorkout) {
          notifications.push({
            userId: coachId,
            type: NotificationType.COACH_ALERT_MISSED_WORKOUT,
            title: `${athlete.displayName} missed a workout`,
            body: `Scheduled workout "${missedWorkout.workoutName}" on ${missedWorkout.date} was not completed.`,
            data: {
              athleteId: athlete.id,
              athleteName: athlete.displayName,
              alertType: 'missed_workout',
              workoutName: missedWorkout.workoutName,
              missedDate: missedWorkout.date,
            },
          });
        }

        // Check for high pain reports
        const highPain = await this.checkHighPainReports(athlete);
        if (highPain) {
          notifications.push({
            userId: coachId,
            type: NotificationType.COACH_ALERT_HIGH_PAIN,
            title: `${athlete.displayName} reported high pain`,
            body: `Pain level ${highPain.painLevel}/10 in ${highPain.bodyPart} during recent workout.`,
            data: {
              athleteId: athlete.id,
              athleteName: athlete.displayName,
              alertType: 'high_pain',
              painLevel: highPain.painLevel,
              bodyPart: highPain.bodyPart,
            },
          });
        }

        // Check for low compliance
        const lowCompliance = await this.checkLowCompliance(athlete);
        if (lowCompliance) {
          notifications.push({
            userId: coachId,
            type: NotificationType.COACH_ALERT_LOW_COMPLIANCE,
            title: `${athlete.displayName} has low workout compliance`,
            body: `Only ${lowCompliance.percentage}% of scheduled workouts completed in the last 7 days.`,
            data: {
              athleteId: athlete.id,
              athleteName: athlete.displayName,
              alertType: 'low_compliance',
              compliancePercentage: lowCompliance.percentage,
            },
          });
        }

        // Check for incomplete intake
        const incompleteIntake = await this.checkIncompleteIntake(athlete, coachId);
        if (incompleteIntake) {
          notifications.push({
            userId: coachId,
            type: NotificationType.COACH_ALERT_INCOMPLETE_INTAKE,
            title: `${athlete.displayName} hasn't completed intake form`,
            body: 'The athlete intake questionnaire is still pending completion.',
            data: {
              athleteId: athlete.id,
              athleteName: athlete.displayName,
              alertType: 'incomplete_intake',
            },
          });
        }
      } catch (error) {
        this.logger.error(`Failed to check alerts for athlete ${athlete.id}`, error);
      }
    }

    // Send all notifications
    if (notifications.length > 0) {
      await this.notificationsService.createNotifications(notifications as any);
      this.logger.log(`Sent ${notifications.length} alerts to coach ${coachId}`);
    }
  }

  private async checkMissedWorkouts(athlete: AthleteInfo): Promise<{ workoutName: string; date: string } | null> {
    const alertKey = `missed_workout:${athlete.id}`;
    if (this.isAlertOnCooldown(alertKey)) return null;

    // Check for workouts scheduled yesterday that weren't completed
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);

    const missedSchedules = await this.scheduleRepo.findManyAcrossOrgs(
      {
        userId: athlete.id,
        dateFrom: yesterday,
        dateTo: endOfYesterday,
        completed: false,
      },
      { limit: 1 },
    );

    if (missedSchedules.length > 0) {
      this.markAlertSent(alertKey);
      // We need to get the workout name - for now just use a generic message
      return {
        workoutName: 'Scheduled Workout',
        date: yesterday.toISOString().split('T')[0],
      };
    }

    return null;
  }

  private async checkHighPainReports(athlete: AthleteInfo): Promise<{ painLevel: number; bodyPart: string } | null> {
    const alertKey = `high_pain:${athlete.id}`;
    if (this.isAlertOnCooldown(alertKey)) return null;

    // Check for pain logs with level >= 7 in the last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const highPainLogs = await this.painLogRepo.findMany({
      filter: {
        userId: athlete.id,
        minPainLevel: 7,
      },
      limit: 1,
    });

    // Filter to last 24 hours
    const recentHighPain = highPainLogs.find((log) => {
      const logDate = log.created_at instanceof Date ? log.created_at : new Date(String(log.created_at));
      return logDate >= yesterday;
    });

    if (recentHighPain) {
      this.markAlertSent(alertKey);
      return {
        painLevel: recentHighPain.pain_level,
        bodyPart: this.formatBodyPart(recentHighPain.body_part),
      };
    }

    return null;
  }

  private async checkLowCompliance(athlete: AthleteInfo): Promise<{ percentage: number } | null> {
    const alertKey = `low_compliance:${athlete.id}`;
    if (this.isAlertOnCooldown(alertKey)) return null;

    // Check compliance over the last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    const [totalScheduled, totalCompleted] = await Promise.all([
      this.scheduleRepo.countManyAcrossOrgs({
        userId: athlete.id,
        dateFrom: weekAgo,
        dateTo: yesterday,
      }),
      this.scheduleRepo.countManyAcrossOrgs({
        userId: athlete.id,
        dateFrom: weekAgo,
        dateTo: yesterday,
        completed: true,
      }),
    ]);

    // Only alert if there were at least 3 scheduled workouts
    if (totalScheduled >= 3) {
      const percentage = Math.round((totalCompleted / totalScheduled) * 100);
      if (percentage < 50) {
        this.markAlertSent(alertKey);
        return { percentage };
      }
    }

    return null;
  }

  private async checkIncompleteIntake(athlete: AthleteInfo, coachId: string): Promise<boolean> {
    const alertKey = `incomplete_intake:${athlete.id}:${coachId}`;
    if (this.isAlertOnCooldown(alertKey)) return false;

    const intake = await this.intakeRepo.findByUserAndCoach(athlete.id, coachId);

    // Alert if intake exists but not completed, or doesn't exist at all
    if (!intake || !intake.completed_at) {
      // Only alert once per week for incomplete intake
      this.markAlertSent(alertKey);
      return true;
    }

    return false;
  }

  private isAlertOnCooldown(key: string): boolean {
    const lastSent = this.sentAlerts.get(key);
    if (!lastSent) return false;

    const hoursSinceSent = (Date.now() - lastSent.getTime()) / (1000 * 60 * 60);
    return hoursSinceSent < this.ALERT_COOLDOWN_HOURS;
  }

  private markAlertSent(key: string): void {
    this.sentAlerts.set(key, new Date());

    // Clean up old entries (older than 48 hours)
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    for (const [k, v] of this.sentAlerts) {
      if (v.getTime() < cutoff) {
        this.sentAlerts.delete(k);
      }
    }
  }

  private formatBodyPart(bodyPart: string): string {
    // Convert snake_case to Title Case
    return bodyPart
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}
