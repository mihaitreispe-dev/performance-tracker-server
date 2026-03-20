import { Injectable } from '@nestjs/common';
import { CardioMetric, CardioMetricType, FitnessMetricType, WorkoutExecution } from 'src/database/interfaces';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { UserSettingsRepository } from 'src/repositories/user-settings.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

export type Vo2MaxSport = 'running' | 'cycling' | 'general';
export type Vo2MaxAlgorithm = 'firstbeat_style' | 'hr_ratio' | 'cycling_power' | 'cooper_test' | 'manual';

export interface Vo2MaxResult {
  value: number | null;
  confidence: number;
  reason?: string;
  dataPointsUsed: number;
  algorithm: Vo2MaxAlgorithm;
  sport?: Vo2MaxSport;
  confidenceInterval?: { lower: number; upper: number } | null;
  metadata?: {
    rSquared?: number;
    segmentsUsed?: number;
    lookbackDays?: number;
    ewmaApplied?: boolean;
    previousEstimate?: number;
  };
}

export interface SteadyStateSegment {
  startTime: Date;
  endTime: Date;
  avgHR: number;
  hrVariance: number;
  hrCV: number; // Coefficient of variation
  distanceMeters: number;
  durationSeconds: number;
  paceMetersPerMin: number;
  paceCV?: number;
  avgPower?: number;
  powerCV?: number;
  vo2?: number;
}

interface DataPoint {
  hrPercent: number;
  paceMetersPerMin?: number;
  vo2?: number;
}

interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  vo2max?: number;
  standardError?: number;
}

@Injectable()
export class Vo2MaxService {
  // Configuration
  private static readonly LOOKBACK_DAYS = 28;
  private static readonly MIN_WORKOUTS = 3;
  private static readonly MIN_SEGMENTS = 5;
  private static readonly MIN_SEGMENT_DURATION_SEC = 180; // 3 minutes
  private static readonly MAX_HR_CV_PERCENT = 5;
  private static readonly MAX_PACE_CV_PERCENT = 5;
  private static readonly VO2_KINETICS_TAU = 35; // seconds
  private static readonly EWMA_ALPHA = 0.3;

  constructor(
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly cardioMetricsRepository: CardioMetricsRepository,
    private readonly workoutRouteRepository: WorkoutRouteRepository,
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly fitnessMetricsRepository: FitnessMetricsRepository,
    private readonly workoutRepository: WorkoutRepository,
  ) {}

  /**
   * Main entry point for enhanced multi-method VO2max estimation
   */
  async calculateVo2MaxEnhanced(userId: string, sport?: Vo2MaxSport): Promise<Vo2MaxResult> {
    const userSettings = await this.userSettingsRepository.findByUserId(userId);
    const maxHR = userSettings?.hr_zones?.maxHr;

    // Get previous estimate for EWMA
    const previousEstimate = await this.getLatestVo2Max(userId, sport);

    // Try sport-specific estimation first
    if (sport === 'cycling' || (!sport && !maxHR)) {
      const cyclingResult = await this.estimateFromCycling(userId);
      if (cyclingResult.value !== null) {
        return this.applyEWMAToResult(cyclingResult, previousEstimate?.value ?? null);
      }
    }

    if (sport === 'running' || !sport) {
      const runningResult = await this.estimateFromRunning(userId);
      if (runningResult.value !== null) {
        return this.applyEWMAToResult(runningResult, previousEstimate?.value ?? null);
      }
    }

    // Fall back to HR-only method
    const hrOnlyResult = await this.estimateFromHRRatio(userId);
    return hrOnlyResult;
  }

  /**
   * Original calculation method (kept for compatibility)
   */
  async calculateVo2Max(userId: string): Promise<Vo2MaxResult> {
    return this.estimateFromRunning(userId);
  }

  /**
   * HR-only estimation using Uth formula (fallback method)
   * Formula: VO2max = 15.3 × (HRmax / HRrest)
   */
  async estimateFromHRRatio(userId: string): Promise<Vo2MaxResult> {
    const userSettings = await this.userSettingsRepository.findByUserId(userId);
    const maxHR = userSettings?.hr_zones?.maxHr;

    // Try to get resting HR from daily health metrics or estimate from recent sleep data
    const restHR = await this.getRestingHeartRate(userId);

    if (!maxHR) {
      return {
        value: null,
        confidence: 0,
        reason: 'Max heart rate not configured in user settings',
        dataPointsUsed: 0,
        algorithm: 'hr_ratio',
        sport: 'general',
      };
    }

    if (!restHR) {
      return {
        value: null,
        confidence: 0,
        reason: 'Resting heart rate not available. Add sleep or wellness data to enable HR-only estimation.',
        dataPointsUsed: 0,
        algorithm: 'hr_ratio',
        sport: 'general',
      };
    }

    // Uth formula: VO2max = 15.3 × (HRmax / HRrest)
    const vo2max = 15.3 * (maxHR / restHR);

    // Sanity check
    if (vo2max < 15 || vo2max > 95) {
      return {
        value: null,
        confidence: 0,
        reason: `Calculated VO2max (${vo2max.toFixed(1)}) outside reasonable range (15-95)`,
        dataPointsUsed: 0,
        algorithm: 'hr_ratio',
        sport: 'general',
      };
    }

    return {
      value: Math.round(vo2max * 10) / 10,
      confidence: 0.4, // Low confidence for HR-only method
      algorithm: 'hr_ratio',
      sport: 'general',
      dataPointsUsed: 0,
      confidenceInterval: {
        lower: Math.round((vo2max * 0.85) * 10) / 10,
        upper: Math.round((vo2max * 1.15) * 10) / 10,
      },
      metadata: {
        lookbackDays: 0,
      },
    };
  }

  /**
   * Enhanced running estimation with submax extrapolation using ACSM equation
   */
  async estimateFromRunning(userId: string): Promise<Vo2MaxResult> {
    const userSettings = await this.userSettingsRepository.findByUserId(userId);
    const maxHR = userSettings?.hr_zones?.maxHr;

    if (!maxHR) {
      return {
        value: null,
        confidence: 0,
        reason: 'Max heart rate not configured in user settings',
        dataPointsUsed: 0,
        algorithm: 'firstbeat_style',
        sport: 'running',
      };
    }

    // Get running workouts from the last 28 days
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - Vo2MaxService.LOOKBACK_DAYS);

    const executions = await this.workoutExecutionRepository.findMany({
      filter: {
        userId,
        completedDateFrom: dateFrom,
        completed: true,
      },
    });

    // Filter to only running workouts with HR and pace data
    const runningExecutions = await this.filterRunningWorkouts(executions);

    if (runningExecutions.length < Vo2MaxService.MIN_WORKOUTS) {
      return {
        value: null,
        confidence: 0,
        reason: `Insufficient running workouts (${runningExecutions.length}/${Vo2MaxService.MIN_WORKOUTS} required)`,
        dataPointsUsed: runningExecutions.length,
        algorithm: 'firstbeat_style',
        sport: 'running',
      };
    }

    // Extract steady-state segments from all workouts
    const allSegments: SteadyStateSegment[] = [];
    for (const execution of runningExecutions) {
      const segments = await this.extractSteadyStateSegments(execution, maxHR);
      allSegments.push(...segments);
    }

    if (allSegments.length < Vo2MaxService.MIN_SEGMENTS) {
      // Try Cooper test detection as fallback
      const cooperResult = await this.detectCooperTest(runningExecutions);
      if (cooperResult) {
        return { ...cooperResult, sport: 'running' };
      }

      return {
        value: null,
        confidence: 0,
        reason: `Insufficient steady-state segments (${allSegments.length}/${Vo2MaxService.MIN_SEGMENTS} required)`,
        dataPointsUsed: allSegments.length,
        algorithm: 'firstbeat_style',
        sport: 'running',
      };
    }

    // Build submax regression with VO2 calculation
    const regression = this.buildSubmaxRegression(allSegments, maxHR);

    if (!regression.vo2max || regression.rSquared < 0.3) {
      return {
        value: null,
        confidence: 0,
        reason: `Poor regression quality (R² = ${regression.rSquared.toFixed(2)})`,
        dataPointsUsed: allSegments.length,
        algorithm: 'firstbeat_style',
        sport: 'running',
        metadata: { rSquared: regression.rSquared },
      };
    }

    const vo2max = regression.vo2max;

    // Calculate confidence based on R² and data quality
    const confidence = this.calculateConfidence(regression.rSquared, allSegments.length);

    // Calculate confidence interval
    const ci = this.calculateConfidenceInterval(regression, allSegments.length);

    // Store the result
    await this.fitnessMetricsRepository.create({
      user_id: userId,
      metric_type: FitnessMetricType.VO2_MAX_RUNNING,
      value: vo2max,
      confidence,
      calculated_at: new Date(),
      metadata: {
        dataPointsUsed: allSegments.length,
        rSquared: regression.rSquared,
        algorithm: 'firstbeat_style',
        sourceType: 'calculated',
        sport: 'running',
        segmentsUsed: allSegments.length,
        lookbackDays: Vo2MaxService.LOOKBACK_DAYS,
        confidenceInterval: ci ?? undefined,
      },
    });

    return {
      value: Math.round(vo2max * 10) / 10,
      confidence,
      dataPointsUsed: allSegments.length,
      algorithm: 'firstbeat_style',
      sport: 'running',
      confidenceInterval: ci ?? undefined,
      metadata: {
        rSquared: regression.rSquared,
        segmentsUsed: allSegments.length,
        lookbackDays: Vo2MaxService.LOOKBACK_DAYS,
      },
    };
  }

  /**
   * Cycling VO2max estimation using HR + Power (ACSM cycling equation)
   * Formula: VO2 = (10.8 × power_watts / body_mass_kg) + 7
   */
  async estimateFromCycling(userId: string): Promise<Vo2MaxResult> {
    const userSettings = await this.userSettingsRepository.findByUserId(userId);
    const maxHR = userSettings?.hr_zones?.maxHr;
    const bodyMassKg = userSettings?.power_zones?.ftp ? await this.estimateBodyMass(userId) : null;

    if (!maxHR) {
      return {
        value: null,
        confidence: 0,
        reason: 'Max heart rate not configured in user settings',
        dataPointsUsed: 0,
        algorithm: 'cycling_power',
        sport: 'cycling',
      };
    }

    if (!bodyMassKg) {
      return {
        value: null,
        confidence: 0,
        reason: 'Body weight required for cycling VO2max estimation',
        dataPointsUsed: 0,
        algorithm: 'cycling_power',
        sport: 'cycling',
      };
    }

    // Get cycling workouts with power data
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - Vo2MaxService.LOOKBACK_DAYS);

    const executions = await this.workoutExecutionRepository.findMany({
      filter: {
        userId,
        completedDateFrom: dateFrom,
        completed: true,
      },
    });

    // Filter to cycling workouts with power
    const cyclingWorkouts = await this.filterCyclingWorkoutsWithPower(executions);

    if (cyclingWorkouts.length < 2) {
      return {
        value: null,
        confidence: 0,
        reason: `Insufficient cycling workouts with power data (${cyclingWorkouts.length}/2 required)`,
        dataPointsUsed: cyclingWorkouts.length,
        algorithm: 'cycling_power',
        sport: 'cycling',
      };
    }

    // Extract power segments
    const segments = await this.extractPowerSegments(cyclingWorkouts, maxHR);

    if (segments.length < 3) {
      return {
        value: null,
        confidence: 0,
        reason: `Insufficient steady-state cycling segments (${segments.length}/3 required)`,
        dataPointsUsed: segments.length,
        algorithm: 'cycling_power',
        sport: 'cycling',
      };
    }

    // Calculate VO2 for each segment using ACSM cycling equation
    const dataPoints = segments.map((seg) => ({
      hrPercent: seg.avgHR / maxHR,
      vo2: (10.8 * (seg.avgPower ?? 0) / bodyMassKg) + 7,
    }));

    // Linear regression: VO2 vs HR%
    const regression = this.linearRegressionVo2(dataPoints);

    // Extrapolate to 100% HRmax
    const vo2max = regression.slope * 1.0 + regression.intercept;

    if (vo2max < 15 || vo2max > 95) {
      return {
        value: null,
        confidence: 0,
        reason: `Calculated VO2max (${vo2max.toFixed(1)}) outside reasonable range`,
        dataPointsUsed: segments.length,
        algorithm: 'cycling_power',
        sport: 'cycling',
      };
    }

    const confidence = this.calculateConfidence(regression.rSquared, segments.length);
    const ci = this.calculateConfidenceInterval(regression, segments.length);

    // Store the result
    await this.fitnessMetricsRepository.create({
      user_id: userId,
      metric_type: FitnessMetricType.VO2_MAX_CYCLING,
      value: vo2max,
      confidence,
      calculated_at: new Date(),
      metadata: {
        dataPointsUsed: segments.length,
        rSquared: regression.rSquared,
        algorithm: 'cycling_power',
        sourceType: 'calculated',
        sport: 'cycling',
        segmentsUsed: segments.length,
        lookbackDays: Vo2MaxService.LOOKBACK_DAYS,
        confidenceInterval: ci ?? undefined,
      },
    });

    return {
      value: Math.round(vo2max * 10) / 10,
      confidence,
      algorithm: 'cycling_power',
      sport: 'cycling',
      dataPointsUsed: segments.length,
      confidenceInterval: ci ?? undefined,
      metadata: {
        rSquared: regression.rSquared,
        segmentsUsed: segments.length,
        lookbackDays: Vo2MaxService.LOOKBACK_DAYS,
      },
    };
  }

  /**
   * Set manual VO2max override
   */
  async setManualVo2Max(
    userId: string,
    value: number,
    sport: Vo2MaxSport = 'general',
    notes?: string,
  ): Promise<Vo2MaxResult> {
    // Determine metric type based on sport
    let metricType: FitnessMetricType;
    switch (sport) {
      case 'running':
        metricType = FitnessMetricType.VO2_MAX_RUNNING;
        break;
      case 'cycling':
        metricType = FitnessMetricType.VO2_MAX_CYCLING;
        break;
      default:
        metricType = FitnessMetricType.VO2_MAX;
    }

    await this.fitnessMetricsRepository.create({
      user_id: userId,
      metric_type: metricType,
      value,
      confidence: 1.0, // Manual entries have 100% confidence
      calculated_at: new Date(),
      metadata: {
        algorithm: 'manual',
        sourceType: 'manual',
        sport,
        notes,
      },
    });

    return {
      value,
      confidence: 1.0,
      dataPointsUsed: 0,
      algorithm: 'manual',
      sport,
    };
  }

  /**
   * Build submax regression with VO2 calculation using ACSM running equation
   */
  private buildSubmaxRegression(segments: SteadyStateSegment[], maxHR: number): RegressionResult {
    // Filter to submax segments (50-90% HRmax)
    const submaxSegments = segments.filter((s) => {
      const hrPercent = s.avgHR / maxHR;
      return hrPercent >= 0.5 && hrPercent <= 0.9;
    });

    if (submaxSegments.length < 3) {
      return { slope: 0, intercept: 0, rSquared: 0 };
    }

    // Calculate VO2 for each segment using ACSM running equation
    // VO2 (ml/kg/min) = (speed_m/min × 0.2) + (speed_m/min × 0.9 × grade) + 3.5
    // For flat running (grade = 0): VO2 = (speed × 0.2) + 3.5
    const dataPoints = submaxSegments.map((seg) => ({
      hrPercent: seg.avgHR / maxHR,
      vo2: seg.paceMetersPerMin * 0.2 + 3.5,
    }));

    // Linear regression: VO2 vs HR%
    const regression = this.linearRegressionVo2(dataPoints);

    // Extrapolate to 100% HRmax
    const vo2max = regression.slope * 1.0 + regression.intercept;

    return { ...regression, vo2max };
  }

  /**
   * Linear regression for VO2 vs HR%
   */
  private linearRegressionVo2(dataPoints: { hrPercent: number; vo2: number }[]): RegressionResult {
    const n = dataPoints.length;
    if (n < 2) {
      return { slope: 0, intercept: 0, rSquared: 0 };
    }

    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;

    for (const point of dataPoints) {
      sumX += point.hrPercent;
      sumY += point.vo2;
      sumXY += point.hrPercent * point.vo2;
      sumX2 += point.hrPercent * point.hrPercent;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) {
      return { slope: 0, intercept: 0, rSquared: 0 };
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R²
    const meanY = sumY / n;
    let ssTotal = 0,
      ssResidual = 0;

    for (const point of dataPoints) {
      const predicted = slope * point.hrPercent + intercept;
      ssTotal += (point.vo2 - meanY) ** 2;
      ssResidual += (point.vo2 - predicted) ** 2;
    }

    const rSquared = ssTotal === 0 ? 0 : 1 - ssResidual / ssTotal;

    // Calculate standard error
    const standardError = ssResidual > 0 && n > 2 ? Math.sqrt(ssResidual / (n - 2)) : 0;

    return {
      slope,
      intercept,
      rSquared: Math.max(0, rSquared),
      standardError,
    };
  }

  /**
   * Apply VO2 kinetics filter for dynamic segments
   * First-order filter with τ ≈ 35s
   */
  private applyKineticsFilter(metrics: CardioMetric[], tau: number = Vo2MaxService.VO2_KINETICS_TAU): CardioMetric[] {
    if (metrics.length < 2) return metrics;

    const filtered: CardioMetric[] = [metrics[0]];

    for (let i = 1; i < metrics.length; i++) {
      const currentTime = new Date(metrics[i].recorded_at).getTime();
      const prevTime = new Date(metrics[i - 1].recorded_at).getTime();
      const dt = (currentTime - prevTime) / 1000; // seconds

      const currentHR = Number.parseFloat(metrics[i].value);
      const prevFilteredHR = Number.parseFloat(filtered[i - 1].value);

      // First-order filter: HR_filtered[t] = HR_filtered[t-1] + (dt/τ) × (HR[t] - HR_filtered[t-1])
      const alpha = Math.min(1, dt / tau);
      const filteredHR = prevFilteredHR + alpha * (currentHR - prevFilteredHR);

      filtered.push({
        ...metrics[i],
        value: filteredHR.toString(),
      });
    }

    return filtered;
  }

  /**
   * Apply EWMA smoothing to result
   */
  private applyEWMAToResult(result: Vo2MaxResult, previousValue: number | null): Vo2MaxResult {
    if (result.value === null || previousValue === null) {
      return result;
    }

    // EWMA: VO2max_smooth = α × VO2max_new + (1-α) × VO2max_previous
    const smoothedValue = Vo2MaxService.EWMA_ALPHA * result.value +
      (1 - Vo2MaxService.EWMA_ALPHA) * previousValue;

    return {
      ...result,
      value: Math.round(smoothedValue * 10) / 10,
      metadata: {
        ...result.metadata,
        ewmaApplied: true,
        previousEstimate: previousValue,
      },
    };
  }

  /**
   * Calculate confidence interval for extrapolated VO2max
   */
  private calculateConfidenceInterval(
    regression: RegressionResult,
    dataPoints: number,
  ): { lower: number; upper: number } | null {
    if (!regression.vo2max || !regression.standardError) {
      return null;
    }

    // Use t-distribution critical value for 95% CI
    // Approximate for n > 30
    const tCritical = dataPoints > 30 ? 1.96 : 2.0 + 4.0 / dataPoints;

    const margin = tCritical * regression.standardError * Math.sqrt(1 + 1 / dataPoints);

    return {
      lower: Math.round((regression.vo2max - margin) * 10) / 10,
      upper: Math.round((regression.vo2max + margin) * 10) / 10,
    };
  }

  private async filterRunningWorkouts(executions: WorkoutExecution[]): Promise<WorkoutExecution[]> {
    const runningExecutions: WorkoutExecution[] = [];

    for (const execution of executions) {
      // Check if workout has HR data and route data
      const hrMetrics = await this.cardioMetricsRepository.findMany({
        filter: {
          workoutExecutionId: execution.id,
          metricType: CardioMetricType.HEART_RATE,
        },
        limit: 1,
      });

      if (hrMetrics.length === 0) continue;

      const route = await this.workoutRouteRepository.findByExecutionId(execution.id);
      if (!route || Number.parseFloat(route.total_distance_meters) < 1000) continue; // Minimum 1km

      // Check workout type via workout_schedule -> workout
      if (execution.workout_schedule_id) {
        // For scheduled workouts, we'd need to check the workout type
        // For now, accept workouts with HR + route data
        runningExecutions.push(execution);
      } else {
        // Unscheduled workout - accept if has required data
        runningExecutions.push(execution);
      }
    }

    return runningExecutions;
  }

  private async filterCyclingWorkoutsWithPower(executions: WorkoutExecution[]): Promise<WorkoutExecution[]> {
    const cyclingWorkouts: WorkoutExecution[] = [];

    for (const execution of executions) {
      // Check for HR data
      const hrMetrics = await this.cardioMetricsRepository.findMany({
        filter: {
          workoutExecutionId: execution.id,
          metricType: CardioMetricType.HEART_RATE,
        },
        limit: 1,
      });

      if (hrMetrics.length === 0) continue;

      // Check for power data
      const powerMetrics = await this.cardioMetricsRepository.findMany({
        filter: {
          workoutExecutionId: execution.id,
          metricType: CardioMetricType.POWER,
        },
        limit: 1,
      });

      if (powerMetrics.length === 0) continue;

      cyclingWorkouts.push(execution);
    }

    return cyclingWorkouts;
  }

  private async extractPowerSegments(executions: WorkoutExecution[], maxHR: number): Promise<SteadyStateSegment[]> {
    const segments: SteadyStateSegment[] = [];

    for (const execution of executions) {
      const hrMetrics = await this.cardioMetricsRepository.findMany({
        filter: {
          workoutExecutionId: execution.id,
          metricType: CardioMetricType.HEART_RATE,
        },
        sort: [{ field: 'recorded_at', direction: 'asc' }],
      });

      const powerMetrics = await this.cardioMetricsRepository.findMany({
        filter: {
          workoutExecutionId: execution.id,
          metricType: CardioMetricType.POWER,
        },
        sort: [{ field: 'recorded_at', direction: 'asc' }],
      });

      if (hrMetrics.length === 0 || powerMetrics.length === 0) continue;

      // Find steady-state segments with both HR and power
      const alignedMetrics = this.alignHRAndPower(hrMetrics, powerMetrics);
      const windowSize = Vo2MaxService.MIN_SEGMENT_DURATION_SEC;

      let windowStart = 0;
      while (windowStart < alignedMetrics.length) {
        const windowEnd = this.findWindowEndForAligned(alignedMetrics, windowStart, windowSize);
        if (windowEnd === -1) break;

        const windowMetrics = alignedMetrics.slice(windowStart, windowEnd + 1);

        const hrValues = windowMetrics.map((m) => m.hr);
        const powerValues = windowMetrics.map((m) => m.power);

        const avgHR = this.average(hrValues);
        const hrCV = (this.standardDeviation(hrValues) / avgHR) * 100;

        const avgPower = this.average(powerValues);
        const powerCV = (this.standardDeviation(powerValues) / avgPower) * 100;

        // Check if both HR and power are stable and in submax range
        if (
          hrCV <= Vo2MaxService.MAX_HR_CV_PERCENT &&
          powerCV <= Vo2MaxService.MAX_PACE_CV_PERCENT &&
          avgHR > maxHR * 0.5 &&
          avgHR < maxHR * 0.9
        ) {
          const startTime = windowMetrics[0].timestamp;
          const endTime = windowMetrics[windowMetrics.length - 1].timestamp;
          const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

          segments.push({
            startTime,
            endTime,
            avgHR,
            hrVariance: hrCV,
            hrCV,
            distanceMeters: 0,
            durationSeconds,
            paceMetersPerMin: 0,
            avgPower,
            powerCV,
          });
        }

        windowStart = windowEnd + 1;
      }
    }

    return segments;
  }

  private alignHRAndPower(
    hrMetrics: CardioMetric[],
    powerMetrics: CardioMetric[],
  ): { timestamp: Date; hr: number; power: number }[] {
    const result: { timestamp: Date; hr: number; power: number }[] = [];

    // Create a map of power by timestamp
    const powerMap = new Map<number, number>();
    for (const pm of powerMetrics) {
      const ts = new Date(pm.recorded_at).getTime();
      powerMap.set(Math.floor(ts / 1000), Number.parseFloat(pm.value));
    }

    for (const hrm of hrMetrics) {
      const timestamp = new Date(hrm.recorded_at);
      const tsKey = Math.floor(timestamp.getTime() / 1000);

      // Find nearest power value
      let power = powerMap.get(tsKey) || 0;
      if (!power) {
        for (let offset = 1; offset <= 5; offset++) {
          power = powerMap.get(tsKey - offset) || powerMap.get(tsKey + offset) || 0;
          if (power) break;
        }
      }

      if (power > 0) {
        result.push({
          timestamp,
          hr: Number.parseFloat(hrm.value),
          power,
        });
      }
    }

    return result;
  }

  private findWindowEndForAligned(
    metrics: { timestamp: Date; hr: number; power: number }[],
    start: number,
    minDurationSec: number,
  ): number {
    const startTime = metrics[start].timestamp.getTime();
    const targetTime = startTime + minDurationSec * 1000;

    for (let i = start + 1; i < metrics.length; i++) {
      if (metrics[i].timestamp.getTime() >= targetTime) {
        return i;
      }
    }
    return -1;
  }

  private async extractSteadyStateSegments(execution: WorkoutExecution, maxHR: number): Promise<SteadyStateSegment[]> {
    const segments: SteadyStateSegment[] = [];

    // Get all HR data for this workout
    let hrMetrics = await this.cardioMetricsRepository.findMany({
      filter: {
        workoutExecutionId: execution.id,
        metricType: CardioMetricType.HEART_RATE,
      },
      sort: [{ field: 'recorded_at', direction: 'asc' }],
    });

    // Apply kinetics filter for smoother HR data
    hrMetrics = this.applyKineticsFilter(hrMetrics);

    // Get pace/speed data
    const paceMetrics = await this.cardioMetricsRepository.findMany({
      filter: {
        workoutExecutionId: execution.id,
        metricType: CardioMetricType.PACE,
      },
      sort: [{ field: 'recorded_at', direction: 'asc' }],
    });

    // Get route for total distance
    const route = await this.workoutRouteRepository.findByExecutionId(execution.id);
    if (!route || hrMetrics.length === 0) return segments;

    // Find steady-state segments using a sliding window approach
    const windowSize = Vo2MaxService.MIN_SEGMENT_DURATION_SEC;
    const metrics = this.alignMetrics(hrMetrics, paceMetrics);

    let windowStart = 0;
    while (windowStart < metrics.length) {
      const windowEnd = this.findWindowEnd(metrics, windowStart, windowSize);
      if (windowEnd === -1) break;

      const windowMetrics = metrics.slice(windowStart, windowEnd + 1);
      const hrValues = windowMetrics.map((m) => m.hr);
      const paceValues = windowMetrics.filter((m) => m.pace > 0).map((m) => m.pace);

      const avgHR = this.average(hrValues);
      const hrCV = (this.standardDeviation(hrValues) / avgHR) * 100;

      // Check pace stability too
      let paceCV = 0;
      let avgPace = 0;
      if (paceValues.length > 0) {
        avgPace = this.average(paceValues);
        paceCV = avgPace > 0 ? (this.standardDeviation(paceValues) / avgPace) * 100 : 100;
      }

      // Check if HR and pace are stable enough and in submax range
      if (
        hrCV <= Vo2MaxService.MAX_HR_CV_PERCENT &&
        paceCV <= Vo2MaxService.MAX_PACE_CV_PERCENT &&
        avgHR > maxHR * 0.5 &&
        avgHR < maxHR * 0.9 &&
        avgPace > 0
      ) {
        const startTime = windowMetrics[0].timestamp;
        const endTime = windowMetrics[windowMetrics.length - 1].timestamp;
        const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

        // Convert pace (min/km) to m/min
        const paceMetersPerMin = 1000 / avgPace;
        const distanceMeters = paceMetersPerMin * (durationSeconds / 60);

        segments.push({
          startTime,
          endTime,
          avgHR,
          hrVariance: hrCV,
          hrCV,
          distanceMeters,
          durationSeconds,
          paceMetersPerMin,
          paceCV,
        });
      }

      windowStart = windowEnd + 1;
    }

    return segments;
  }

  private alignMetrics(
    hrMetrics: CardioMetric[],
    paceMetrics: CardioMetric[],
  ): { timestamp: Date; hr: number; pace: number }[] {
    const result: { timestamp: Date; hr: number; pace: number }[] = [];

    // Create a map of pace by timestamp (rounded to seconds)
    const paceMap = new Map<number, number>();
    for (const pm of paceMetrics) {
      const ts = new Date(pm.recorded_at).getTime();
      paceMap.set(Math.floor(ts / 1000), Number.parseFloat(pm.value));
    }

    for (const hrm of hrMetrics) {
      const timestamp = new Date(hrm.recorded_at);
      const tsKey = Math.floor(timestamp.getTime() / 1000);

      // Find nearest pace value
      let pace = paceMap.get(tsKey) || 0;
      if (!pace) {
        // Look for nearby pace values
        for (let offset = 1; offset <= 5; offset++) {
          pace = paceMap.get(tsKey - offset) || paceMap.get(tsKey + offset) || 0;
          if (pace) break;
        }
      }

      result.push({
        timestamp,
        hr: Number.parseFloat(hrm.value),
        pace,
      });
    }

    return result;
  }

  private findWindowEnd(
    metrics: { timestamp: Date; hr: number; pace: number }[],
    start: number,
    minDurationSec: number,
  ): number {
    const startTime = metrics[start].timestamp.getTime();
    const targetTime = startTime + minDurationSec * 1000;

    for (let i = start + 1; i < metrics.length; i++) {
      if (metrics[i].timestamp.getTime() >= targetTime) {
        return i;
      }
    }
    return -1;
  }

  private linearRegression(dataPoints: DataPoint[]): RegressionResult {
    const n = dataPoints.length;
    if (n < 2) {
      return { slope: 0, intercept: 0, rSquared: 0 };
    }

    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;

    for (const point of dataPoints) {
      const y = point.paceMetersPerMin ?? 0;
      sumX += point.hrPercent;
      sumY += y;
      sumXY += point.hrPercent * y;
      sumX2 += point.hrPercent * point.hrPercent;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) {
      return { slope: 0, intercept: 0, rSquared: 0 };
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R²
    const meanY = sumY / n;
    let ssTotal = 0,
      ssResidual = 0;

    for (const point of dataPoints) {
      const y = point.paceMetersPerMin ?? 0;
      const predicted = slope * point.hrPercent + intercept;
      ssTotal += (y - meanY) ** 2;
      ssResidual += (y - predicted) ** 2;
    }

    const rSquared = ssTotal === 0 ? 0 : 1 - ssResidual / ssTotal;

    return { slope, intercept, rSquared: Math.max(0, rSquared) };
  }

  private calculateConfidence(rSquared: number, dataPoints: number): number {
    // Base confidence from R²
    let confidence = 0;

    // HR-only method has base 0.4
    if (dataPoints === 0) {
      return 0.4;
    }

    // Start with R² contribution
    if (rSquared >= 0.9) {
      confidence += 0.35;
    } else if (rSquared >= 0.8) {
      confidence += 0.25;
    } else if (rSquared >= 0.6) {
      confidence += 0.15;
    }

    // Add base confidence for having data
    confidence += 0.3;

    // Bonus for more data points
    if (dataPoints >= 10) {
      confidence += 0.25;
    } else if (dataPoints >= 5) {
      confidence += 0.15;
    }

    // Bonus for multiple intensity levels (assumed if more segments)
    if (dataPoints >= 8) {
      confidence += 0.1;
    }

    return Math.min(1.0, Math.max(0, Math.round(confidence * 100) / 100));
  }

  private async detectCooperTest(executions: WorkoutExecution[]): Promise<Vo2MaxResult | null> {
    // Look for workouts that match Cooper test criteria (~12 min all-out run)
    for (const execution of executions) {
      if (!execution.duration_seconds) continue;

      // Cooper test is ~12 minutes (allow 11-13 minutes)
      if (execution.duration_seconds < 660 || execution.duration_seconds > 780) continue;

      const route = await this.workoutRouteRepository.findByExecutionId(execution.id);
      if (!route) continue;

      const distance = Number.parseFloat(route.total_distance_meters);
      if (distance < 1500 || distance > 4000) continue; // Reasonable range for Cooper test

      // Cooper formula: VO2max = (distance_meters - 504.9) / 44.73
      const vo2max = (distance - 504.9) / 44.73;

      if (vo2max >= 20 && vo2max <= 80) {
        // Sanity check
        return {
          value: Math.round(vo2max * 10) / 10,
          confidence: 0.75, // Cooper test has known accuracy
          dataPointsUsed: 1,
          algorithm: 'cooper_test',
        };
      }
    }

    return null;
  }

  async getLatestVo2Max(userId: string, sport?: Vo2MaxSport): Promise<Vo2MaxResult | null> {
    // Determine which metric type to fetch
    let metricType: FitnessMetricType;
    switch (sport) {
      case 'running':
        metricType = FitnessMetricType.VO2_MAX_RUNNING;
        break;
      case 'cycling':
        metricType = FitnessMetricType.VO2_MAX_CYCLING;
        break;
      default:
        metricType = FitnessMetricType.VO2_MAX;
    }

    // Try sport-specific first, then fall back to general
    let latest = await this.fitnessMetricsRepository.getLatestByType(userId, metricType);

    if (!latest && sport) {
      latest = await this.fitnessMetricsRepository.getLatestByType(userId, FitnessMetricType.VO2_MAX);
    }

    if (!latest) return null;

    return {
      value: Number.parseFloat(latest.value),
      confidence: Number.parseFloat(latest.confidence || '0'),
      dataPointsUsed: latest.metadata?.dataPointsUsed || 0,
      algorithm: (latest.metadata?.algorithm as Vo2MaxAlgorithm) || 'firstbeat_style',
      sport: latest.metadata?.sport as Vo2MaxSport | undefined,
      confidenceInterval: latest.metadata?.confidenceInterval || null,
      metadata: {
        rSquared: latest.metadata?.rSquared,
        segmentsUsed: latest.metadata?.segmentsUsed,
        lookbackDays: latest.metadata?.lookbackDays,
        ewmaApplied: latest.metadata?.ewmaApplied,
      },
    };
  }

  async getVo2MaxHistory(userId: string, days: number = 90, sport?: Vo2MaxSport) {
    // Determine which metric type to fetch
    let metricType: FitnessMetricType;
    switch (sport) {
      case 'running':
        metricType = FitnessMetricType.VO2_MAX_RUNNING;
        break;
      case 'cycling':
        metricType = FitnessMetricType.VO2_MAX_CYCLING;
        break;
      default:
        metricType = FitnessMetricType.VO2_MAX;
    }

    return this.fitnessMetricsRepository.getHistory(userId, metricType, days);
  }

  /**
   * Get resting heart rate from available data sources
   */
  private async getRestingHeartRate(userId: string): Promise<number | null> {
    // Try to get from RHR metric first
    const rhrMetric = await this.fitnessMetricsRepository.getLatestByType(userId, FitnessMetricType.RHR);
    if (rhrMetric) {
      return Number.parseFloat(rhrMetric.value);
    }

    // TODO: Could also get from daily health metrics or sleep data
    // For now, return null if no explicit RHR is set
    return null;
  }

  /**
   * Estimate body mass for cycling calculations
   * In a full implementation, this would come from user profile
   */
  private async estimateBodyMass(_userId: string): Promise<number | null> {
    // Default to 70kg if no body mass available
    // TODO: Add body mass to user settings or profile
    return 70;
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private variance(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.average(values);
    return values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  }

  private standardDeviation(values: number[]): number {
    return Math.sqrt(this.variance(values));
  }
}
