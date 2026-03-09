import { Injectable } from '@nestjs/common';
import {
  LimitingStream,
  LoadModelParameterValues,
  MultiStreamLoadDaily,
  NewMultiStreamLoadDaily,
  StreamType,
  TrainingStressScore,
  WorkoutExecution,
  WorkoutType,
} from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';
import { LoadModelParametersRepository } from 'src/repositories/load-model-parameters.repository';
import { MultiStreamLoadRepository } from 'src/repositories/multi-stream-load.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { TrainingStressRepository } from 'src/repositories/training-stress.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

export interface StreamLoads {
  aerobic: number;
  msk: number;
  neural: number;
}

export interface DailyStreamMetrics {
  date: string;
  aerobic: { ctl: number; atl: number; tsb: number; dailyLoad: number };
  msk: { ctl: number; atl: number; tsb: number; dailyLoad: number };
  neural: { ctl: number; atl: number; tsb: number; dailyLoad: number };
  limitingStream: LimitingStream;
}

interface WorkoutWithStress {
  execution: WorkoutExecution;
  stress: TrainingStressScore | null;
  workoutType: WorkoutType | null;
  avgRpe: number | null;
}

@Injectable()
export class MultiStreamLoadService {
  constructor(
    private readonly multiStreamLoadRepository: MultiStreamLoadRepository,
    private readonly trainingStressRepository: TrainingStressRepository,
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly workoutRepository: WorkoutRepository,
    private readonly workoutScheduleRepository: WorkoutScheduleRepository,
    private readonly loadModelParametersRepository: LoadModelParametersRepository,
    private readonly setCompletionRepository: SetCompletionRepository,
  ) {}

  /**
   * Calculate daily loads for all three streams
   */
  async calculateDailyLoads(userId: string, date: Date): Promise<DailyStreamMetrics> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    // Get personalized parameters (or defaults)
    const params = await this.loadModelParametersRepository.getParametersWithDefaults(userId);

    // Get yesterday's values for decay calculation
    const yesterday = new Date(targetDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayData = await this.multiStreamLoadRepository.findByUserAndDate(userId, yesterday);

    const previousCTL = {
      aerobic: yesterdayData ? parseFloat(yesterdayData.aerobic_ctl || '0') : 0,
      msk: yesterdayData ? parseFloat(yesterdayData.msk_ctl || '0') : 0,
      neural: yesterdayData ? parseFloat(yesterdayData.neural_ctl || '0') : 0,
    };

    const previousATL = {
      aerobic: yesterdayData ? parseFloat(yesterdayData.aerobic_atl || '0') : 0,
      msk: yesterdayData ? parseFloat(yesterdayData.msk_atl || '0') : 0,
      neural: yesterdayData ? parseFloat(yesterdayData.neural_atl || '0') : 0,
    };

    // Get all workouts for the day
    const startOfDay = new Date(targetDate);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const executions = await this.workoutExecutionRepository.findMany({
      filter: {
        userId,
        completedDateFrom: startOfDay,
        completedDateTo: endOfDay,
        completed: true,
      },
    });

    // Get stress scores and workout details for each execution
    const workoutsWithStress: WorkoutWithStress[] = await Promise.all(
      executions.map(async (execution) => {
        const stress = await this.trainingStressRepository.findByWorkoutExecutionId(execution.id);
        // Get workout through the schedule (execution -> schedule -> workout)
        let workoutType: WorkoutType | null = null;
        if (execution.workout_schedule_id) {
          const schedule = await this.workoutScheduleRepository.findById(execution.workout_schedule_id);
          if (schedule) {
            const workout = await this.workoutRepository.findById(schedule.workout_id);
            workoutType = workout?.type ?? null;
          }
        }
        const avgRpe = await this.getAverageRpe(execution.id);
        return {
          execution,
          stress: stress ?? null,
          workoutType,
          avgRpe,
        };
      }),
    );

    // Calculate per-stream daily loads
    const dailyLoads = this.calculateStreamLoads(workoutsWithStress, params);

    // Apply exponential decay per stream
    const aerobicCtl = previousCTL.aerobic + (dailyLoads.aerobic - previousCTL.aerobic) / params.aerobic_ctl_decay;
    const aerobicAtl = previousATL.aerobic + (dailyLoads.aerobic - previousATL.aerobic) / params.aerobic_atl_decay;
    const aerobicTsb = aerobicCtl - aerobicAtl;

    const mskCtl = previousCTL.msk + (dailyLoads.msk - previousCTL.msk) / params.msk_ctl_decay;
    const mskAtl = previousATL.msk + (dailyLoads.msk - previousATL.msk) / params.msk_atl_decay;
    const mskTsb = mskCtl - mskAtl;

    const neuralCtl = previousCTL.neural + (dailyLoads.neural - previousCTL.neural) / params.neural_ctl_decay;
    const neuralAtl = previousATL.neural + (dailyLoads.neural - previousATL.neural) / params.neural_atl_decay;
    const neuralTsb = neuralCtl - neuralAtl;

    // Identify limiting stream (most negative TSB)
    const limitingStream = this.identifyLimitingStream(aerobicTsb, mskTsb, neuralTsb);

    // Store results
    const data: NewMultiStreamLoadDaily = {
      user_id: userId,
      date: formatDateToYMD(targetDate),
      aerobic_ctl: this.round(aerobicCtl),
      aerobic_atl: this.round(aerobicAtl),
      aerobic_tsb: this.round(aerobicTsb),
      aerobic_daily_load: this.round(dailyLoads.aerobic),
      msk_ctl: this.round(mskCtl),
      msk_atl: this.round(mskAtl),
      msk_tsb: this.round(mskTsb),
      msk_daily_load: this.round(dailyLoads.msk),
      neural_ctl: this.round(neuralCtl),
      neural_atl: this.round(neuralAtl),
      neural_tsb: this.round(neuralTsb),
      neural_daily_load: this.round(dailyLoads.neural),
      limiting_stream: limitingStream,
      metadata: {
        workoutIds: executions.map((e) => e.id),
        aerobicBreakdown: workoutsWithStress.map((w) => ({
          workoutId: w.execution.id,
          load: this.calculateAerobicLoad(w, params),
          sport: this.getSportType(w.workoutType),
        })),
        mskBreakdown: workoutsWithStress.map((w) => ({
          workoutId: w.execution.id,
          load: this.calculateMskLoad(w),
          sport: this.getSportType(w.workoutType),
        })),
        neuralBreakdown: workoutsWithStress.map((w) => ({
          workoutId: w.execution.id,
          load: this.calculateNeuralLoad(w),
          sport: this.getSportType(w.workoutType),
        })),
      },
    };

    await this.multiStreamLoadRepository.upsert(data);

    return {
      date: formatDateToYMD(targetDate),
      aerobic: {
        ctl: this.round(aerobicCtl),
        atl: this.round(aerobicAtl),
        tsb: this.round(aerobicTsb),
        dailyLoad: this.round(dailyLoads.aerobic),
      },
      msk: {
        ctl: this.round(mskCtl),
        atl: this.round(mskAtl),
        tsb: this.round(mskTsb),
        dailyLoad: this.round(dailyLoads.msk),
      },
      neural: {
        ctl: this.round(neuralCtl),
        atl: this.round(neuralAtl),
        tsb: this.round(neuralTsb),
        dailyLoad: this.round(dailyLoads.neural),
      },
      limitingStream,
    };
  }

  /**
   * Calculate stream-specific loads from workout data
   */
  private calculateStreamLoads(
    workouts: WorkoutWithStress[],
    params: LoadModelParameterValues,
  ): StreamLoads {
    let aerobic = 0;
    let msk = 0;
    let neural = 0;

    for (const workout of workouts) {
      aerobic += this.calculateAerobicLoad(workout, params);
      msk += this.calculateMskLoad(workout);
      neural += this.calculateNeuralLoad(workout);
    }

    return { aerobic, msk, neural };
  }

  /**
   * Calculate aerobic load contribution
   * AEROBIC: run_rTSS×1.0 + bike_TSS×0.85 + swim×0.7 + strength×0.3
   */
  private calculateAerobicLoad(
    workout: WorkoutWithStress,
    params: LoadModelParameterValues,
  ): number {
    const tss = workout.stress?.tss ? parseFloat(workout.stress.tss) : 0;
    const sportType = this.getSportType(workout.workoutType);

    switch (sportType) {
      case 'run':
        return tss * params.run_aerobic_coef;
      case 'bike':
        return tss * params.bike_aerobic_coef;
      case 'swim':
        return tss * params.swim_aerobic_coef;
      case 'strength':
        return tss * params.strength_aerobic_coef;
      default:
        return tss * 0.5; // Default coefficient
    }
  }

  /**
   * Calculate musculoskeletal load contribution
   * MSK: run_volume×grade_factor + lower_strength×0.8 + plyos×1.2
   */
  private calculateMskLoad(workout: WorkoutWithStress): number {
    const sportType = this.getSportType(workout.workoutType);
    const duration = workout.execution.duration_seconds || 0;
    const durationMinutes = duration / 60;

    switch (sportType) {
      case 'run':
        // Running has high MSK impact - use duration as proxy for volume
        // Grade factor would require route data
        return durationMinutes * 1.2;
      case 'strength':
        // Strength training has high MSK impact
        // Could be refined with actual volume data (sets × reps × weight)
        return durationMinutes * 1.5;
      case 'bike':
        // Cycling has lower MSK impact
        return durationMinutes * 0.3;
      case 'swim':
        // Swimming has minimal MSK impact
        return durationMinutes * 0.2;
      default:
        return durationMinutes * 0.5;
    }
  }

  /**
   * Calculate neural/CNS load contribution
   * NEURAL: time_>90%HR + heavy_compound×RPE² + racing×1.5
   */
  private calculateNeuralLoad(workout: WorkoutWithStress): number {
    const sportType = this.getSportType(workout.workoutType);
    const duration = workout.execution.duration_seconds || 0;
    const durationMinutes = duration / 60;
    const rpe = workout.avgRpe || 5; // Default to 5 if no RPE

    // Anaerobic TE indicates high-intensity neural load
    const anaerobicTE = workout.stress?.anaerobic_te ? parseFloat(workout.stress.anaerobic_te) : 0;

    // Base neural load from intensity
    let neuralLoad = anaerobicTE * 10; // TE 0-5 → 0-50

    // Add RPE-squared factor for heavy efforts (esp. strength)
    if (sportType === 'strength' && rpe >= 7) {
      neuralLoad += (rpe * rpe) / 10 * durationMinutes / 30;
    }

    // High intensity cardio also taxes CNS
    if ((sportType === 'run' || sportType === 'bike') && anaerobicTE >= 3) {
      neuralLoad += durationMinutes * 0.5;
    }

    return neuralLoad;
  }

  /**
   * Identify the limiting stream based on TSB values
   */
  private identifyLimitingStream(aerobicTsb: number, mskTsb: number, neuralTsb: number): LimitingStream {
    const minTsb = Math.min(aerobicTsb, mskTsb, neuralTsb);

    // Only flag as limiting if TSB is negative
    if (minTsb >= 0) {
      return null;
    }

    if (minTsb === aerobicTsb) return StreamType.AEROBIC;
    if (minTsb === mskTsb) return StreamType.MSK;
    return StreamType.NEURAL;
  }

  /**
   * Get sport type from workout type
   */
  private getSportType(workoutType: WorkoutType | null): string {
    if (!workoutType) return 'other';

    const type = workoutType.toLowerCase();

    if (type.includes('run') || type.includes('running') || type === 'tempo_run' || type === 'interval_run') {
      return 'run';
    }
    if (type.includes('bike') || type.includes('cycling') || type.includes('ride')) {
      return 'bike';
    }
    if (type.includes('swim')) {
      return 'swim';
    }
    if (
      type.includes('strength') ||
      type.includes('weight') ||
      type.includes('resistance') ||
      type === 'hypertrophy' ||
      type === 'power_lifting'
    ) {
      return 'strength';
    }

    return 'other';
  }

  /**
   * Get average RPE for a workout execution
   */
  private async getAverageRpe(executionId: string): Promise<number | null> {
    const setCompletions = await this.setCompletionRepository.findMany({
      filter: { workoutExecutionId: executionId },
    });

    const rpeValues = setCompletions
      .filter((sc) => sc.rpe !== null)
      .map((sc) => sc.rpe!);

    if (rpeValues.length === 0) return null;

    return rpeValues.reduce((sum, rpe) => sum + rpe, 0) / rpeValues.length;
  }

  /**
   * Get latest multi-stream load data for a user
   */
  async getLatest(userId: string): Promise<MultiStreamLoadDaily | null> {
    const latest = await this.multiStreamLoadRepository.getLatestForUser(userId);
    return latest || null;
  }

  /**
   * Get multi-stream load history
   */
  async getHistory(userId: string, days: number = 90): Promise<MultiStreamLoadDaily[]> {
    return this.multiStreamLoadRepository.getDateRange(userId, days);
  }

  /**
   * Backfill historical multi-stream loads
   */
  async backfillHistory(userId: string, days: number = 90): Promise<void> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      await this.calculateDailyLoads(userId, new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
