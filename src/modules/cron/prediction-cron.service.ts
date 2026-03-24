import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FitnessMetricType, RaceSport, WorkoutType } from 'src/database/interfaces';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { RacePredictionRepository } from 'src/repositories/race-prediction.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { RunningPredictionService } from '../api/v1/race-prediction/services/running-prediction.service';

// Standard distances for daily predictions
const STANDARD_DISTANCES = [
  { name: '5K', meters: 5000 },
  { name: '10K', meters: 10000 },
  { name: 'Half Marathon', meters: 21097 },
  { name: 'Marathon', meters: 42195 },
];

@Injectable()
export class PredictionCronService {
  private readonly logger = new Logger(PredictionCronService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly runningPredictionService: RunningPredictionService,
    private readonly racePredictionRepository: RacePredictionRepository,
    private readonly fitnessMetricsRepository: FitnessMetricsRepository,
    private readonly personalRecordRepository: PersonalRecordRepository,
    private readonly workoutScheduleRepository: WorkoutScheduleRepository,
  ) {}

  /**
   * Generate daily predictions for all active users
   * Runs daily at 5:00 AM (after wearable sync at 4:00 AM)
   */
  @Cron('0 5 * * *')
  async generateDailyPredictions() {
    this.logger.log('Starting daily prediction generation');

    try {
      // Get users who have been active in the last 30 days
      const activeUsers = await this.userRepository.findRecentlyActive(30);
      this.logger.log(`Generating predictions for ${activeUsers.length} active users`);

      let successCount = 0;
      let errorCount = 0;

      for (const user of activeUsers) {
        try {
          const generatedCount = await this.generatePredictionsForUser(user.id);
          if (generatedCount > 0) {
            successCount++;
          }
        } catch (error) {
          errorCount++;
          this.logger.error(`Failed to generate predictions for user ${user.id}`, error);
        }
      }

      this.logger.log(`Daily prediction generation completed: ${successCount} users processed, ${errorCount} errors`);
    } catch (error) {
      this.logger.error('Failed to run daily prediction generation', error);
    }
  }

  /**
   * Generate predictions for a single user for all standard distances
   */
  async generatePredictionsForUser(userId: string, predictionDate?: Date): Promise<number> {
    const effectiveDate = predictionDate || new Date();

    // Get user's fitness data
    const vo2maxMetric = await this.fitnessMetricsRepository.getLatestByType(userId, FitnessMetricType.VO2_MAX);
    const vo2max = vo2maxMetric ? Number.parseFloat(vo2maxMetric.value) : undefined;
    const vo2maxConfidence = vo2maxMetric?.confidence ? Number.parseFloat(vo2maxMetric.confidence) : undefined;

    // Check if user has any running data to make predictions
    const personalRecords = await this.personalRecordRepository.findMany({
      userId,
      workoutType: WorkoutType.RUN,
      category: 'cardio_other',
    });

    // If no VO2max and no running PRs, skip this user
    if (!vo2max && personalRecords.length === 0) {
      return 0;
    }

    let generatedCount = 0;

    for (const distance of STANDARD_DISTANCES) {
      try {
        const prediction = await this.runningPredictionService.predictRaceTime(userId, {
          targetDistanceMeters: distance.meters,
          vo2max,
          vo2maxConfidence,
          personalRecords,
        });

        // Skip if no valid prediction
        if (prediction.predictedTimeSeconds === 0 || prediction.confidenceScore === 0) {
          continue;
        }

        // Store the prediction
        await this.racePredictionRepository.create({
          user_id: userId,
          athlete_race_id: null, // Quick prediction, not linked to a registered race
          sport: RaceSport.RUN,
          distance_meters: distance.meters,
          race_date: null,
          predicted_time_seconds: prediction.predictedTimeSeconds,
          confidence_lower_seconds: prediction.confidenceLowerSeconds,
          confidence_upper_seconds: prediction.confidenceUpperSeconds,
          confidence_score: prediction.confidenceScore,
          target_pace_per_km: prediction.targetPacePerKm,
          status: 'current',
          metadata: {
            algorithms_used: prediction.methods.map((m) => m.name),
            input_metrics: {
              vo2max,
              vo2max_confidence: vo2maxConfidence,
            },
            ensemble_weights: prediction.methods.reduce(
              (acc, m) => {
                acc[m.name] = m.weight;
                return acc;
              },
              {} as Record<string, number>,
            ),
            generated_by: 'daily_cron',
            prediction_date: effectiveDate.toISOString().split('T')[0],
          },
        });

        generatedCount++;
      } catch (error) {
        this.logger.warn(`Failed to generate ${distance.name} prediction for user ${userId}`, error);
      }
    }

    return generatedCount;
  }

  /**
   * Backfill historical predictions for a user based on their workout history
   * This is called when a user uploads historical data (e.g., syncs from Strava)
   */
  async backfillPredictions(userId: string): Promise<{ datesProcessed: number; predictionsGenerated: number }> {
    this.logger.log(`Starting prediction backfill for user ${userId}`);

    // Get unique workout dates to find the earliest data point
    const workoutDates = await this.getWorkoutDatesForUser(userId);

    if (workoutDates.length === 0) {
      this.logger.log(`No workout history found for user ${userId}`);
      return { datesProcessed: 0, predictionsGenerated: 0 };
    }

    // Sort dates ascending
    workoutDates.sort((a, b) => a.getTime() - b.getTime());

    const earliestDate = workoutDates[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Generate predictions for each week from earliest date to today
    // (daily would be too many, weekly is more reasonable for historical data)
    const weeksToProcess: Date[] = [];
    const currentDate = new Date(earliestDate);
    currentDate.setHours(0, 0, 0, 0);

    // Start from the first Sunday on or after the earliest workout
    while (currentDate.getDay() !== 0) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    while (currentDate <= today) {
      weeksToProcess.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 7);
    }

    this.logger.log(`Backfilling ${weeksToProcess.length} weeks of predictions for user ${userId}`);

    let datesProcessed = 0;
    let predictionsGenerated = 0;

    for (const date of weeksToProcess) {
      try {
        const count = await this.generatePredictionsForUser(userId, date);
        predictionsGenerated += count;
        datesProcessed++;
      } catch (error) {
        this.logger.warn(`Failed to backfill predictions for ${date.toISOString()} for user ${userId}`, error);
      }
    }

    this.logger.log(`Backfill completed for user ${userId}: ${datesProcessed} weeks, ${predictionsGenerated} predictions`);
    return { datesProcessed, predictionsGenerated };
  }

  /**
   * Get unique dates when user had workouts
   */
  private async getWorkoutDatesForUser(userId: string): Promise<Date[]> {
    // Get completed workout schedules for this user
    const workouts = await this.workoutScheduleRepository.findMany({
      filter: {
        userId,
        dateFrom: new Date('2020-01-01'),
        dateTo: new Date(),
        completed: true,
      },
    });

    // Extract unique dates
    const dateSet = new Set<string>();
    for (const workout of workouts) {
      if (workout.scheduled_date) {
        const dateStr = new Date(workout.scheduled_date).toISOString().split('T')[0];
        dateSet.add(dateStr);
      }
      if (workout.completed_at) {
        const dateStr = new Date(workout.completed_at).toISOString().split('T')[0];
        dateSet.add(dateStr);
      }
    }

    return Array.from(dateSet).map((d) => new Date(d));
  }
}
