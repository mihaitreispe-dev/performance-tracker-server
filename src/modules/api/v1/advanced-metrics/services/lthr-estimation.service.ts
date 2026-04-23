import { Injectable } from '@nestjs/common';
import { CardioMetric, CardioMetricType, FitnessMetricType, WorkoutExecution } from 'src/database/interfaces';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

export type LthrMethod = 'peak_rolling' | 'hrmc' | 'tt_segment' | 'race_effort' | 'manual';
export type LthrSport = 'running' | 'cycling' | 'general';

export interface LthrEstimate {
  value: number;
  confidence: number;
  method: LthrMethod;
  sport: LthrSport;
  calculatedAt: Date;
  metadata: {
    dataPointsUsed: number;
    workoutsAnalyzed: number;
    lookbackDays: number;
    peak20?: number;
    peak60?: number;
    hrmcValue?: number;
    hrmcWindowMinutes?: number;
  };
}

export interface LthrHistoryPoint {
  value: number;
  confidence: number;
  method: LthrMethod;
  sport: LthrSport;
  calculatedAt: Date;
}

interface HRMCResult {
  hrmc: number;
  confidence: number;
  windowMinutes: number;
}

interface PeakRollingResult {
  peak20: number;
  peak60: number;
  estimatedLthr: number;
  confidence: number;
}

interface WorkoutHRData {
  execution: WorkoutExecution;
  hrMetrics: CardioMetric[];
  workoutType?: string;
}

@Injectable()
export class LthrEstimationService {
  // Configuration constants
  private static readonly LOOKBACK_DAYS = 90;
  private static readonly MIN_WORKOUTS = 3;
  private static readonly MIN_EFFORT_MINUTES = 20;
  private static readonly HR_MIN = 35;
  private static readonly HR_MAX = 220;
  private static readonly MAX_JUMP_BPM_PER_SEC = 25;
  private static readonly MAX_INTERP_GAP_SEC = 10;

  constructor(
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly cardioMetricsRepository: CardioMetricsRepository,
    private readonly fitnessMetricsRepository: FitnessMetricsRepository,
    private readonly workoutRepository: WorkoutRepository,
    private readonly workoutScheduleRepository: WorkoutScheduleRepository,
  ) {}

  /**
   * Main entry point - estimate LTHR using best available method
   */
  async estimateLTHR(userId: string, sport?: LthrSport): Promise<LthrEstimate> {
    const workouts = await this.getWorkoutsWithHR(userId, LthrEstimationService.LOOKBACK_DAYS, sport);

    if (workouts.length < LthrEstimationService.MIN_WORKOUTS) {
      // Not enough data - return null estimate
      return {
        value: 0,
        confidence: 0,
        method: 'peak_rolling',
        sport: sport || 'general',
        calculatedAt: new Date(),
        metadata: {
          dataPointsUsed: 0,
          workoutsAnalyzed: workouts.length,
          lookbackDays: LthrEstimationService.LOOKBACK_DAYS,
        },
      };
    }

    // Try HRMC method first (most reliable for steady-state efforts)
    const hrmcResult = await this.estimateFromHRMC(workouts);

    // Also calculate peak rolling HR
    const peakRollingResult = this.calculatePeakRollingHR(workouts);

    // Combine estimates with confidence weighting
    return this.combineEstimates(hrmcResult, peakRollingResult, workouts.length, sport || 'general');
  }

  /**
   * Estimate LTHR from peak rolling HR across all workouts
   * TrainingPeaks-style: max(peak60, 0.95 * peak20)
   */
  async estimateFromPeakRolling(userId: string, sport?: LthrSport): Promise<LthrEstimate> {
    const workouts = await this.getWorkoutsWithHR(userId, LthrEstimationService.LOOKBACK_DAYS, sport);
    const result = this.calculatePeakRollingHR(workouts);

    const estimate: LthrEstimate = {
      value: result.estimatedLthr,
      confidence: result.confidence,
      method: 'peak_rolling',
      sport: sport || 'general',
      calculatedAt: new Date(),
      metadata: {
        dataPointsUsed: workouts.reduce((sum, w) => sum + w.hrMetrics.length, 0),
        workoutsAnalyzed: workouts.length,
        lookbackDays: LthrEstimationService.LOOKBACK_DAYS,
        peak20: result.peak20,
        peak60: result.peak60,
      },
    };

    // Store the result
    await this.storeEstimate(userId, estimate);

    return estimate;
  }

  /**
   * Calculate peak rolling HR from workout data
   */
  private calculatePeakRollingHR(workouts: WorkoutHRData[]): PeakRollingResult {
    if (workouts.length === 0) {
      return { peak20: 0, peak60: 0, estimatedLthr: 0, confidence: 0 };
    }

    let globalPeak20 = 0;
    let globalPeak60 = 0;

    for (const workout of workouts) {
      const hr = this.preprocessHRMetrics(workout.hrMetrics);

      // Calculate 20-minute peak rolling mean
      const peak20 = this.peakRollingMean(hr, 20 * 60);
      if (peak20 > globalPeak20) {
        globalPeak20 = peak20;
      }

      // Calculate 60-minute peak rolling mean
      const peak60 = this.peakRollingMean(hr, 60 * 60);
      if (peak60 > globalPeak60) {
        globalPeak60 = peak60;
      }
    }

    // LTHR estimate: max of peak60 or 95% of peak20
    const estimatedLthr = Math.round(Math.max(globalPeak60, 0.95 * globalPeak20));

    // Calculate confidence based on data quality
    let confidence = 0.3; // Base confidence

    // Having both 20-min and 60-min peaks increases confidence
    if (globalPeak20 > 0) confidence += 0.2;
    if (globalPeak60 > 0) confidence += 0.3;

    // If peak20 and peak60 are close (within 5%), higher confidence
    if (globalPeak60 > 0 && globalPeak20 > 0) {
      const ratio = globalPeak60 / globalPeak20;
      if (ratio >= 0.9 && ratio <= 1.0) {
        confidence += 0.1;
      }
    }

    return {
      peak20: globalPeak20,
      peak60: globalPeak60,
      estimatedLthr,
      confidence: Math.min(1.0, confidence),
    };
  }

  /**
   * Estimate LTHR using HRMC (Maximal Constant HR) method
   * Finds the highest stable 30-min HR window
   */
  async estimateFromHRMC(workouts: WorkoutHRData[]): Promise<HRMCResult> {
    let bestHRMC = 0;
    let bestConfidence = 0;
    let bestWindowMinutes = 0;

    for (const workout of workouts) {
      const hr = this.preprocessHRMetrics(workout.hrMetrics);

      // Find HRMC for this workout
      const result = this.findMaximalConstantHR(hr, 30, 0.4, 4.0);

      if (result.hrmc > bestHRMC && result.confidence > 0.5) {
        bestHRMC = result.hrmc;
        bestConfidence = result.confidence;
        bestWindowMinutes = 30;
      }
    }

    return {
      hrmc: bestHRMC,
      confidence: bestConfidence,
      windowMinutes: bestWindowMinutes,
    };
  }

  /**
   * Find maximal constant HR - highest stable 30-min window
   * Criteria: slope <= 0.4 bpm/min, std <= 4.0 bpm
   */
  private findMaximalConstantHR(
    hrMetrics: CardioMetric[],
    windowMinutes = 30,
    maxSlopeBpmPerMin = 0.4,
    maxStdBpm = 4.0,
  ): HRMCResult {
    if (hrMetrics.length < 2) {
      return { hrmc: 0, confidence: 0, windowMinutes: 0 };
    }

    // Convert to time-value pairs for analysis
    const timeValues: Array<{ time: number; hr: number }> = [];
    const startTime = new Date(hrMetrics[0].recorded_at).getTime();

    for (const metric of hrMetrics) {
      const time = (new Date(metric.recorded_at).getTime() - startTime) / 1000; // seconds
      const hr = Number.parseFloat(metric.value);
      timeValues.push({ time, hr });
    }

    const windowSeconds = windowMinutes * 60;
    const totalDuration = timeValues[timeValues.length - 1].time - timeValues[0].time;

    // Not enough data for the window
    if (totalDuration < windowSeconds) {
      return { hrmc: 0, confidence: 0, windowMinutes: 0 };
    }

    let bestHRMC = 0;
    let bestConfidence = 0;

    // Slide window across the workout
    for (let windowStart = 0; windowStart <= totalDuration - windowSeconds; windowStart += 60) {
      const windowEnd = windowStart + windowSeconds;

      // Get values in this window
      const windowValues = timeValues.filter((tv) => tv.time >= windowStart && tv.time < windowEnd);

      if (windowValues.length < 10) continue; // Not enough samples

      const hrs = windowValues.map((wv) => wv.hr);
      const times = windowValues.map((wv) => wv.time);

      // Calculate mean HR
      const meanHR = hrs.reduce((a, b) => a + b, 0) / hrs.length;

      // Calculate standard deviation
      const variance = hrs.reduce((sum, hr) => sum + (hr - meanHR) ** 2, 0) / hrs.length;
      const stdHR = Math.sqrt(variance);

      // Calculate slope using linear regression
      const slope = this.linearRegressionSlope(times, hrs) * 60; // bpm per minute

      // Check stability criteria
      if (Math.abs(slope) <= maxSlopeBpmPerMin && stdHR <= maxStdBpm) {
        if (meanHR > bestHRMC) {
          bestHRMC = Math.round(meanHR);

          // Calculate confidence based on stability
          let confidence = 0.6; // Base confidence for meeting criteria
          if (Math.abs(slope) <= maxSlopeBpmPerMin / 2) confidence += 0.15;
          if (stdHR <= maxStdBpm / 2) confidence += 0.15;
          if (windowValues.length >= 100) confidence += 0.1; // Good sample density

          bestConfidence = Math.min(1.0, confidence);
        }
      }
    }

    return {
      hrmc: bestHRMC,
      confidence: bestConfidence,
      windowMinutes,
    };
  }

  /**
   * Calculate slope using linear regression
   */
  private linearRegressionSlope(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 2) return 0;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
    const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  /**
   * Combine HRMC and peak rolling estimates
   */
  private combineEstimates(
    hrmcResult: HRMCResult,
    peakRollingResult: PeakRollingResult,
    workoutCount: number,
    sport: LthrSport,
  ): LthrEstimate {
    let finalValue: number;
    let finalConfidence: number;
    let method: LthrMethod;

    // Prefer HRMC if it found a stable window with high confidence
    if (hrmcResult.hrmc > 0 && hrmcResult.confidence >= 0.7) {
      // HRMC is primary, cross-validate with peak rolling
      if (peakRollingResult.estimatedLthr > 0 && Math.abs(hrmcResult.hrmc - peakRollingResult.estimatedLthr) <= 5) {
        // Both methods agree - average them with weighted confidence
        finalValue = Math.round(
          (hrmcResult.hrmc * hrmcResult.confidence + peakRollingResult.estimatedLthr * peakRollingResult.confidence) /
            (hrmcResult.confidence + peakRollingResult.confidence),
        );
        finalConfidence = Math.min(1.0, (hrmcResult.confidence + peakRollingResult.confidence) / 1.5);
        method = 'hrmc';
      } else {
        // HRMC only
        finalValue = hrmcResult.hrmc;
        finalConfidence = hrmcResult.confidence;
        method = 'hrmc';
      }
    } else if (peakRollingResult.estimatedLthr > 0) {
      // Fall back to peak rolling
      finalValue = peakRollingResult.estimatedLthr;
      finalConfidence = peakRollingResult.confidence;
      method = 'peak_rolling';
    } else {
      // No valid estimate
      finalValue = 0;
      finalConfidence = 0;
      method = 'peak_rolling';
    }

    // Adjust confidence based on data quantity
    const workoutBonus = Math.min(0.2, workoutCount * 0.02);
    finalConfidence = Math.min(1.0, finalConfidence + workoutBonus);

    return {
      value: finalValue,
      confidence: Math.round(finalConfidence * 100) / 100,
      method,
      sport,
      calculatedAt: new Date(),
      metadata: {
        dataPointsUsed: 0, // Will be filled by caller
        workoutsAnalyzed: workoutCount,
        lookbackDays: LthrEstimationService.LOOKBACK_DAYS,
        peak20: peakRollingResult.peak20,
        peak60: peakRollingResult.peak60,
        hrmcValue: hrmcResult.hrmc > 0 ? hrmcResult.hrmc : undefined,
        hrmcWindowMinutes: hrmcResult.hrmc > 0 ? hrmcResult.windowMinutes : undefined,
      },
    };
  }

  /**
   * Get current LTHR (latest stored value)
   */
  async getCurrentLTHR(userId: string, sport?: LthrSport): Promise<LthrEstimate | null> {
    const metricType = this.getMetricTypeForSport(sport);
    const metric = await this.fitnessMetricsRepository.getLatestByType(userId, metricType);

    if (!metric) {
      return null;
    }

    return {
      value: Number.parseFloat(metric.value),
      confidence: Number.parseFloat(metric.confidence || '0'),
      method: (metric.metadata?.algorithm as LthrMethod) || 'peak_rolling',
      sport: this.getSportFromMetricType(metric.metric_type),
      calculatedAt: metric.calculated_at,
      metadata: {
        dataPointsUsed: metric.metadata?.dataPointsUsed || 0,
        workoutsAnalyzed: 0,
        lookbackDays: LthrEstimationService.LOOKBACK_DAYS,
        peak20: metric.metadata?.peak20 as number | undefined,
        peak60: metric.metadata?.peak60 as number | undefined,
      },
    };
  }

  /**
   * Get LTHR history
   */
  async getLTHRHistory(userId: string, days = 90, sport?: LthrSport): Promise<LthrHistoryPoint[]> {
    const metricType = this.getMetricTypeForSport(sport);
    const metrics = await this.fitnessMetricsRepository.getHistory(userId, metricType, days);

    return metrics.map((m) => ({
      value: Number.parseFloat(m.value),
      confidence: Number.parseFloat(m.confidence || '0'),
      method: (m.metadata?.algorithm as LthrMethod) || 'peak_rolling',
      sport: this.getSportFromMetricType(m.metric_type),
      calculatedAt: m.calculated_at,
    }));
  }

  /**
   * Set manual LTHR override
   */
  async setManualLTHR(userId: string, value: number, sport?: LthrSport, notes?: string): Promise<LthrEstimate> {
    const metricType = this.getMetricTypeForSport(sport);
    const sportValue = sport || 'general';

    await this.fitnessMetricsRepository.create({
      user_id: userId,
      metric_type: metricType,
      value: value,
      confidence: 1.0, // Manual entries have 100% confidence
      calculated_at: new Date(),
      metadata: {
        sourceType: 'manual',
        algorithm: 'manual',
        notes,
      },
    });

    return {
      value,
      confidence: 1.0,
      method: 'manual',
      sport: sportValue,
      calculatedAt: new Date(),
      metadata: {
        dataPointsUsed: 0,
        workoutsAnalyzed: 0,
        lookbackDays: 0,
      },
    };
  }

  /**
   * Store LTHR estimate in database
   */
  private async storeEstimate(userId: string, estimate: LthrEstimate): Promise<void> {
    if (estimate.value === 0) {
      return; // Don't store invalid estimates
    }

    const metricType = this.getMetricTypeForSport(estimate.sport);

    await this.fitnessMetricsRepository.create({
      user_id: userId,
      metric_type: metricType,
      value: estimate.value,
      confidence: estimate.confidence,
      calculated_at: estimate.calculatedAt,
      metadata: {
        sourceType: 'calculated',
        algorithm: estimate.method,
        dataPointsUsed: estimate.metadata.dataPointsUsed,
        peak20: estimate.metadata.peak20,
        peak60: estimate.metadata.peak60,
        hrmcValue: estimate.metadata.hrmcValue,
        hrmcWindowMinutes: estimate.metadata.hrmcWindowMinutes,
      },
    });
  }

  /**
   * Get workouts with HR data for a user
   */
  private async getWorkoutsWithHR(userId: string, lookbackDays: number, sport?: LthrSport): Promise<WorkoutHRData[]> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - lookbackDays);

    // Get completed workout executions
    const executions = await this.workoutExecutionRepository.findMany({
      filter: { userId },
      sort: [{ field: 'started_at', direction: 'desc' }],
    });

    const recentExecutions = executions.filter(
      (e) =>
        e.completed_at &&
        new Date(e.started_at) >= dateFrom &&
        e.duration_seconds &&
        e.duration_seconds >= LthrEstimationService.MIN_EFFORT_MINUTES * 60,
    );

    const workoutData: WorkoutHRData[] = [];

    // Batch fetch workout schedules and workouts for sport filtering
    const scheduleIds = recentExecutions.map((e) => e.workout_schedule_id).filter((id): id is string => id !== null);

    const schedules = scheduleIds.length > 0 ? await this.workoutScheduleRepository.findByIds(scheduleIds) : [];
    const scheduleMap = new Map(schedules.map((s) => [s.id, s]));

    const workoutIds = schedules.map((s) => s.workout_id);
    const workouts = workoutIds.length > 0 ? await this.workoutRepository.findByIds(workoutIds) : [];
    const workoutMap = new Map(workouts.map((w) => [w.id, w]));

    for (const execution of recentExecutions) {
      // Get HR metrics for this workout
      const hrMetrics = await this.cardioMetricsRepository.findMany({
        filter: {
          workoutExecutionId: execution.id,
          metricType: CardioMetricType.HEART_RATE,
        },
        sort: [{ field: 'recorded_at', direction: 'asc' }],
      });

      // Skip workouts with insufficient HR data
      if (hrMetrics.length < 60) continue; // At least 1 minute of data

      // Get workout type if available
      let workoutType: string | undefined;
      if (execution.workout_schedule_id) {
        const schedule = scheduleMap.get(execution.workout_schedule_id);
        if (schedule) {
          const workout = workoutMap.get(schedule.workout_id);
          if (workout) {
            workoutType = workout.type;
          }
        }
      }

      // Filter by sport if specified
      if (sport) {
        if (sport === 'running' && workoutType !== 'run' && workoutType !== 'cardio') {
          continue;
        }
        if (sport === 'cycling' && workoutType !== 'cycling') {
          continue;
        }
      }

      workoutData.push({
        execution,
        hrMetrics,
        workoutType,
      });
    }

    return workoutData;
  }

  /**
   * Calculate peak rolling mean for a given window size
   */
  private peakRollingMean(hrMetrics: CardioMetric[], windowSeconds: number): number {
    if (hrMetrics.length < 2) return 0;

    let maxMean = 0;
    const startTime = new Date(hrMetrics[0].recorded_at).getTime();

    // Build time-indexed array
    const timeValues: Array<{ time: number; hr: number }> = hrMetrics.map((m) => ({
      time: (new Date(m.recorded_at).getTime() - startTime) / 1000,
      hr: Number.parseFloat(m.value),
    }));

    const totalDuration = timeValues[timeValues.length - 1].time;

    // Not enough data for the window
    if (totalDuration < windowSeconds) {
      return 0;
    }

    // Slide window across the data
    for (let windowStart = 0; windowStart <= totalDuration - windowSeconds; windowStart += 30) {
      const windowEnd = windowStart + windowSeconds;

      const windowValues = timeValues.filter((tv) => tv.time >= windowStart && tv.time < windowEnd);

      if (windowValues.length < 10) continue;

      // Calculate time-weighted mean
      let weightedSum = 0;
      let totalWeight = 0;

      for (let i = 1; i < windowValues.length; i++) {
        const dt = windowValues[i].time - windowValues[i - 1].time;
        if (dt > 0 && dt <= 60) {
          weightedSum += windowValues[i].hr * dt;
          totalWeight += dt;
        }
      }

      if (totalWeight > 0) {
        const mean = weightedSum / totalWeight;
        if (mean > maxMean) {
          maxMean = mean;
        }
      }
    }

    return Math.round(maxMean);
  }

  /**
   * Preprocess HR metrics to remove artifacts
   */
  private preprocessHRMetrics(hrMetrics: CardioMetric[]): CardioMetric[] {
    if (hrMetrics.length === 0) return [];

    // Step 1: Remove out-of-bounds values
    const filtered = hrMetrics.filter((m) => {
      const hr = Number.parseFloat(m.value);
      return hr >= LthrEstimationService.HR_MIN && hr <= LthrEstimationService.HR_MAX;
    });

    // Step 2: De-spike (remove implausible HR jumps)
    const despiked: CardioMetric[] = [];
    for (let i = 0; i < filtered.length; i++) {
      if (i === 0) {
        despiked.push(filtered[i]);
        continue;
      }

      const prevHR = Number.parseFloat(despiked[despiked.length - 1].value);
      const currHR = Number.parseFloat(filtered[i].value);
      const prevTime = new Date(despiked[despiked.length - 1].recorded_at).getTime();
      const currTime = new Date(filtered[i].recorded_at).getTime();
      const dt = (currTime - prevTime) / 1000;

      if (dt <= 0) continue;

      const hrChangePerSec = Math.abs(currHR - prevHR) / dt;

      if (hrChangePerSec <= LthrEstimationService.MAX_JUMP_BPM_PER_SEC) {
        despiked.push(filtered[i]);
      }
    }

    return despiked;
  }

  /**
   * Get metric type for sport
   */
  private getMetricTypeForSport(sport?: LthrSport): FitnessMetricType {
    switch (sport) {
      case 'running':
        return FitnessMetricType.LTHR_RUNNING;
      case 'cycling':
        return FitnessMetricType.LTHR_CYCLING;
      default:
        return FitnessMetricType.LTHR;
    }
  }

  /**
   * Get sport from metric type
   */
  private getSportFromMetricType(metricType: string): LthrSport {
    if (metricType === FitnessMetricType.LTHR_RUNNING) {
      return 'running';
    }
    if (metricType === FitnessMetricType.LTHR_CYCLING) {
      return 'cycling';
    }
    return 'general';
  }
}
