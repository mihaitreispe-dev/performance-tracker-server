import { forwardRef, Inject, Injectable } from '@nestjs/common';
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
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { TrainingStressService } from './training-stress.service';

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
  sessionRpe: number | null;
  srpeTss: number | null;
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
    @Inject(forwardRef(() => TrainingStressService))
    private readonly trainingStressService: TrainingStressService,
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
      aerobic: yesterdayData ? Number.parseFloat(yesterdayData.aerobic_ctl || '0') : 0,
      msk: yesterdayData ? Number.parseFloat(yesterdayData.msk_ctl || '0') : 0,
      neural: yesterdayData ? Number.parseFloat(yesterdayData.neural_ctl || '0') : 0,
    };

    const previousATL = {
      aerobic: yesterdayData ? Number.parseFloat(yesterdayData.aerobic_atl || '0') : 0,
      msk: yesterdayData ? Number.parseFloat(yesterdayData.msk_atl || '0') : 0,
      neural: yesterdayData ? Number.parseFloat(yesterdayData.neural_atl || '0') : 0,
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

        // Get session RPE data from execution
        const sessionRpe = execution.session_rpe ?? null;
        const srpeTss = execution.srpe_tss ? Number.parseFloat(execution.srpe_tss) : null;

        return {
          execution,
          stress: stress ?? null,
          workoutType,
          avgRpe,
          sessionRpe,
          srpeTss,
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
   * Integrates session RPE (sRPE-TSS) when available using Foster method
   */
  private calculateStreamLoads(workouts: WorkoutWithStress[], params: LoadModelParameterValues): StreamLoads {
    let aerobic = 0;
    let msk = 0;
    let neural = 0;

    for (const workout of workouts) {
      let workoutAerobic = this.calculateAerobicLoad(workout, params);
      const workoutMsk = this.calculateMskLoad(workout);
      let workoutNeural = this.calculateNeuralLoad(workout);

      // Integrate session RPE when available
      if (workout.sessionRpe && workout.srpeTss) {
        const calculatedTss = workout.stress?.tss ? Number.parseFloat(workout.stress.tss) : null;

        // Use sRPE as neural load indicator for all workout types (not just strength)
        const durationMin = (workout.execution.duration_seconds || 0) / 60;
        const rpeNeuralContribution = (workout.sessionRpe ** 2 / 10) * (durationMin / 30);
        workoutNeural += rpeNeuralContribution;

        // If RPE:TSS ratio > 1.2, athlete is perceiving the workout as harder
        // Adjust aerobic load upward by 10% to account for perceived difficulty
        if (calculatedTss && calculatedTss > 0) {
          const rpeTssRatio = workout.srpeTss / calculatedTss;
          if (rpeTssRatio > 1.2) {
            workoutAerobic *= 1.1; // 10% adjustment for perceived difficulty
          }
        }
      }

      aerobic += workoutAerobic;
      msk += workoutMsk;
      neural += workoutNeural;
    }

    return { aerobic, msk, neural };
  }

  /**
   * Calculate aerobic load contribution
   * AEROBIC: run_rTSS×1.0 + bike_TSS×0.85 + swim×0.7 + strength×0.3
   */
  private calculateAerobicLoad(workout: WorkoutWithStress, params: LoadModelParameterValues): number {
    const tss = workout.stress?.tss ? Number.parseFloat(workout.stress.tss) : 0;
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
   * Now uses session RPE for all workout types when available
   */
  private calculateNeuralLoad(workout: WorkoutWithStress): number {
    const sportType = this.getSportType(workout.workoutType);
    const duration = workout.execution.duration_seconds || 0;
    const durationMinutes = duration / 60;

    // Use session RPE if available, otherwise use average set RPE, otherwise default to 5
    const rpe = workout.sessionRpe ?? workout.avgRpe ?? 5;

    // Anaerobic TE indicates high-intensity neural load
    const anaerobicTE = workout.stress?.anaerobic_te ? Number.parseFloat(workout.stress.anaerobic_te) : 0;

    // Base neural load from intensity
    let neuralLoad = anaerobicTE * 10; // TE 0-5 → 0-50

    // Add RPE-squared factor for heavy efforts
    // Previously only for strength, now applies to all workout types when RPE >= 7
    if (rpe >= 7) {
      const rpeContribution = (((rpe * rpe) / 10) * durationMinutes) / 30;
      // Strength gets full contribution, others get partial
      if (sportType === 'strength') {
        neuralLoad += rpeContribution;
      } else {
        neuralLoad += rpeContribution * 0.5; // 50% for non-strength workouts
      }
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

    const rpeValues = setCompletions.filter((sc) => sc.rpe !== null).map((sc) => sc.rpe!);

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
   * Get multi-stream load history with gaps filled and extended to today
   */
  async getHistory(userId: string, days: number = 90): Promise<DailyStreamMetrics[]> {
    const records = await this.multiStreamLoadRepository.getDateRange(userId, days);

    // If no data, return empty array
    if (records.length === 0) {
      return [];
    }

    // Get user's parameters for decay constants
    const params = await this.loadModelParametersRepository.getParametersWithDefaults(userId);

    // Create a map of existing records by date
    const recordMap = new Map<string, MultiStreamLoadDaily>();
    for (const r of records) {
      recordMap.set(formatDateToYMD(r.date), r);
    }

    // Generate all dates from (today - days) to today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days + 1);

    const result: DailyStreamMetrics[] = [];

    // Decay factors per day with no training (load = 0)
    const aerobicCtlDecay = 1 - 1 / params.aerobic_ctl_decay;
    const aerobicAtlDecay = 1 - 1 / params.aerobic_atl_decay;
    const mskCtlDecay = 1 - 1 / params.msk_ctl_decay;
    const mskAtlDecay = 1 - 1 / params.msk_atl_decay;
    const neuralCtlDecay = 1 - 1 / params.neural_ctl_decay;
    const neuralAtlDecay = 1 - 1 / params.neural_atl_decay;

    // Track last known values for decay
    let lastAerobic = { ctl: 0, atl: 0 };
    let lastMsk = { ctl: 0, atl: 0 };
    let lastNeural = { ctl: 0, atl: 0 };

    const currentDate = new Date(startDate);
    while (currentDate <= today) {
      const dateStr = formatDateToYMD(currentDate);
      const existingRecord = recordMap.get(dateStr);

      if (existingRecord) {
        // Use actual data
        lastAerobic = {
          ctl: Number.parseFloat(existingRecord.aerobic_ctl || '0'),
          atl: Number.parseFloat(existingRecord.aerobic_atl || '0'),
        };
        lastMsk = {
          ctl: Number.parseFloat(existingRecord.msk_ctl || '0'),
          atl: Number.parseFloat(existingRecord.msk_atl || '0'),
        };
        lastNeural = {
          ctl: Number.parseFloat(existingRecord.neural_ctl || '0'),
          atl: Number.parseFloat(existingRecord.neural_atl || '0'),
        };

        result.push({
          date: dateStr,
          aerobic: {
            ctl: this.round(lastAerobic.ctl),
            atl: this.round(lastAerobic.atl),
            tsb: this.round(Number.parseFloat(existingRecord.aerobic_tsb || '0')),
            dailyLoad: this.round(Number.parseFloat(existingRecord.aerobic_daily_load || '0')),
          },
          msk: {
            ctl: this.round(lastMsk.ctl),
            atl: this.round(lastMsk.atl),
            tsb: this.round(Number.parseFloat(existingRecord.msk_tsb || '0')),
            dailyLoad: this.round(Number.parseFloat(existingRecord.msk_daily_load || '0')),
          },
          neural: {
            ctl: this.round(lastNeural.ctl),
            atl: this.round(lastNeural.atl),
            tsb: this.round(Number.parseFloat(existingRecord.neural_tsb || '0')),
            dailyLoad: this.round(Number.parseFloat(existingRecord.neural_daily_load || '0')),
          },
          limitingStream: existingRecord.limiting_stream,
        });
      } else if (lastAerobic.ctl > 0 || lastMsk.ctl > 0 || lastNeural.ctl > 0) {
        // No data for this day but we have previous values - apply decay
        lastAerobic = {
          ctl: this.round(lastAerobic.ctl * aerobicCtlDecay),
          atl: this.round(lastAerobic.atl * aerobicAtlDecay),
        };
        lastMsk = {
          ctl: this.round(lastMsk.ctl * mskCtlDecay),
          atl: this.round(lastMsk.atl * mskAtlDecay),
        };
        lastNeural = {
          ctl: this.round(lastNeural.ctl * neuralCtlDecay),
          atl: this.round(lastNeural.atl * neuralAtlDecay),
        };

        // Floor small values to 0
        if (lastAerobic.ctl < 0.1) lastAerobic.ctl = 0;
        if (lastAerobic.atl < 0.1) lastAerobic.atl = 0;
        if (lastMsk.ctl < 0.1) lastMsk.ctl = 0;
        if (lastMsk.atl < 0.1) lastMsk.atl = 0;
        if (lastNeural.ctl < 0.1) lastNeural.ctl = 0;
        if (lastNeural.atl < 0.1) lastNeural.atl = 0;

        const aerobicTsb = this.round(lastAerobic.ctl - lastAerobic.atl);
        const mskTsb = this.round(lastMsk.ctl - lastMsk.atl);
        const neuralTsb = this.round(lastNeural.ctl - lastNeural.atl);

        result.push({
          date: dateStr,
          aerobic: {
            ctl: lastAerobic.ctl,
            atl: lastAerobic.atl,
            tsb: aerobicTsb,
            dailyLoad: 0,
          },
          msk: {
            ctl: lastMsk.ctl,
            atl: lastMsk.atl,
            tsb: mskTsb,
            dailyLoad: 0,
          },
          neural: {
            ctl: lastNeural.ctl,
            atl: lastNeural.atl,
            tsb: neuralTsb,
            dailyLoad: 0,
          },
          limitingStream: this.identifyLimitingStream(aerobicTsb, mskTsb, neuralTsb),
        });
      }
      // If all CTLs are 0, skip this date (no data yet)

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
  }

  /**
   * Backfill historical multi-stream loads
   */
  async backfillHistory(userId: string, days: number = 90): Promise<void> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    // First, find all completed workouts in the date range
    const workouts = await this.workoutExecutionRepository.findMany({
      filter: {
        userId,
        completedDateFrom: startDate,
        completedDateTo: endDate,
        completed: true,
      },
    });

    // Calculate TSS for any workouts that don't have it yet
    for (const workout of workouts) {
      const existingTss = await this.trainingStressRepository.findByWorkoutExecutionId(workout.id);
      if (!existingTss) {
        await this.trainingStressService.calculateForWorkout(workout.id);
      }
    }

    // Reset endDate for the day-by-day calculation
    endDate.setHours(0, 0, 0, 0);

    // Check if user has any data before the start date (for seeding)
    const dataBeforeStart = await this.multiStreamLoadRepository.findByUserAndDate(
      userId,
      new Date(startDate.getTime() - 24 * 60 * 60 * 1000),
    );

    if (!dataBeforeStart) {
      // Estimate initial values from first 14 days of training (PMC seeding)
      const params = await this.loadModelParametersRepository.getParametersWithDefaults(userId);
      const seedingPeriodEnd = new Date(startDate);
      seedingPeriodEnd.setDate(seedingPeriodEnd.getDate() + 14);

      let totalAerobic = 0;
      let totalMsk = 0;
      let totalNeural = 0;
      let daysWithData = 0;

      const seedDate = new Date(startDate);
      while (seedDate <= seedingPeriodEnd && seedDate <= endDate) {
        const seedStartOfDay = new Date(seedDate);
        const seedEndOfDay = new Date(seedDate);
        seedEndOfDay.setHours(23, 59, 59, 999);

        const dayWorkouts = await this.workoutExecutionRepository.findMany({
          filter: {
            userId,
            completedDateFrom: seedStartOfDay,
            completedDateTo: seedEndOfDay,
            completed: true,
          },
        });

        if (dayWorkouts.length > 0) {
          const workoutsWithStress: WorkoutWithStress[] = await Promise.all(
            dayWorkouts.map(async (execution) => {
              const stress = await this.trainingStressRepository.findByWorkoutExecutionId(execution.id);
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
                sessionRpe: execution.session_rpe ?? null,
                srpeTss: execution.srpe_tss ? Number.parseFloat(execution.srpe_tss) : null,
              };
            }),
          );

          const dayLoads = this.calculateStreamLoads(workoutsWithStress, params);
          if (dayLoads.aerobic > 0 || dayLoads.msk > 0 || dayLoads.neural > 0) {
            totalAerobic += dayLoads.aerobic;
            totalMsk += dayLoads.msk;
            totalNeural += dayLoads.neural;
            daysWithData++;
          }
        }

        seedDate.setDate(seedDate.getDate() + 1);
      }

      if (daysWithData > 0) {
        // Calculate average daily loads and seed at 80% (assume prior training)
        const avgAerobic = (totalAerobic / daysWithData) * 0.8;
        const avgMsk = (totalMsk / daysWithData) * 0.8;
        const avgNeural = (totalNeural / daysWithData) * 0.8;

        // Store seeded values for day before start
        const dayBeforeStart = new Date(startDate);
        dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);

        const seedData: NewMultiStreamLoadDaily = {
          user_id: userId,
          date: formatDateToYMD(dayBeforeStart),
          aerobic_ctl: this.round(avgAerobic),
          aerobic_atl: this.round(avgAerobic),
          aerobic_tsb: 0,
          aerobic_daily_load: 0,
          msk_ctl: this.round(avgMsk),
          msk_atl: this.round(avgMsk),
          msk_tsb: 0,
          msk_daily_load: 0,
          neural_ctl: this.round(avgNeural),
          neural_atl: this.round(avgNeural),
          neural_tsb: 0,
          neural_daily_load: 0,
          limiting_stream: null,
          metadata: { seeded: true },
        };

        await this.multiStreamLoadRepository.upsert(seedData);
      }
    }

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
