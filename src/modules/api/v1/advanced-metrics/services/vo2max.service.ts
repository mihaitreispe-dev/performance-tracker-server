import { Injectable } from '@nestjs/common';
import { CardioMetric, CardioMetricType, FitnessMetricType, WorkoutExecution } from 'src/database/interfaces';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { UserSettingsRepository } from 'src/repositories/user-settings.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

export interface Vo2MaxResult {
  value: number | null;
  confidence: number;
  reason?: string;
  dataPointsUsed: number;
  algorithm: string;
}

export interface SteadyStateSegment {
  startTime: Date;
  endTime: Date;
  avgHR: number;
  hrVariance: number;
  distanceMeters: number;
  durationSeconds: number;
  paceMetersPerMin: number;
}

interface DataPoint {
  hrPercent: number;
  paceMetersPerMin: number;
}

interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
}

@Injectable()
export class Vo2MaxService {
  // Minimum requirements for calculation
  private readonly MIN_SEGMENTS = 5;
  private readonly MIN_WORKOUTS = 3;
  private readonly LOOKBACK_DAYS = 28;
  private readonly MIN_SEGMENT_DURATION_SEC = 180; // 3 minutes
  private readonly MAX_HR_VARIANCE_PERCENT = 5;

  constructor(
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly cardioMetricsRepository: CardioMetricsRepository,
    private readonly workoutRouteRepository: WorkoutRouteRepository,
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly fitnessMetricsRepository: FitnessMetricsRepository,
    private readonly workoutRepository: WorkoutRepository,
  ) {}

  async calculateVo2Max(userId: string): Promise<Vo2MaxResult> {
    const userSettings = await this.userSettingsRepository.findByUserId(userId);
    const maxHR = userSettings?.hr_zones?.maxHr;

    if (!maxHR) {
      return {
        value: null,
        confidence: 0,
        reason: 'Max heart rate not configured in user settings',
        dataPointsUsed: 0,
        algorithm: 'firstbeat_style',
      };
    }

    // Get running workouts from the last 28 days
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - this.LOOKBACK_DAYS);

    const executions = await this.workoutExecutionRepository.findMany({
      filter: {
        userId,
        completedDateFrom: dateFrom,
        completed: true,
      },
    });

    // Filter to only running workouts with HR and pace data
    const runningExecutions = await this.filterRunningWorkouts(executions);

    if (runningExecutions.length < this.MIN_WORKOUTS) {
      return {
        value: null,
        confidence: 0,
        reason: `Insufficient running workouts (${runningExecutions.length}/${this.MIN_WORKOUTS} required)`,
        dataPointsUsed: runningExecutions.length,
        algorithm: 'firstbeat_style',
      };
    }

    // Extract steady-state segments from all workouts
    const allSegments: SteadyStateSegment[] = [];
    for (const execution of runningExecutions) {
      const segments = await this.extractSteadyStateSegments(execution, maxHR);
      allSegments.push(...segments);
    }

    if (allSegments.length < this.MIN_SEGMENTS) {
      // Try Cooper test detection as fallback
      const cooperResult = await this.detectCooperTest(runningExecutions);
      if (cooperResult) {
        return cooperResult;
      }

      return {
        value: null,
        confidence: 0,
        reason: `Insufficient steady-state segments (${allSegments.length}/${this.MIN_SEGMENTS} required)`,
        dataPointsUsed: allSegments.length,
        algorithm: 'firstbeat_style',
      };
    }

    // Create data points for regression
    const dataPoints: DataPoint[] = allSegments.map((seg) => ({
      hrPercent: seg.avgHR / maxHR,
      paceMetersPerMin: seg.paceMetersPerMin,
    }));

    // Perform linear regression
    const regression = this.linearRegression(dataPoints);

    // Extrapolate pace at 100% HRmax
    const paceAt100Percent = regression.slope * 1.0 + regression.intercept;

    // Convert pace to VO2 max using ACSM running equation
    // VO2 (ml/kg/min) = (speed_m/min × 0.2) + (speed_m/min × 0.9 × grade) + 3.5
    // For flat running (grade = 0): VO2 = (speed × 0.2) + 3.5
    const vo2max = paceAt100Percent * 0.2 + 3.5;

    // Calculate confidence based on R² and data quality
    const confidence = this.calculateConfidence(regression.rSquared, allSegments.length);

    // Store the result
    await this.fitnessMetricsRepository.create({
      user_id: userId,
      metric_type: FitnessMetricType.VO2_MAX,
      value: vo2max,
      confidence,
      calculated_at: new Date(),
      metadata: {
        dataPointsUsed: allSegments.length,
        rSquared: regression.rSquared,
        algorithm: 'firstbeat_style',
        sourceType: 'calculated',
      },
    });

    return {
      value: Math.round(vo2max * 10) / 10,
      confidence,
      dataPointsUsed: allSegments.length,
      algorithm: 'firstbeat_style',
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

  private async extractSteadyStateSegments(execution: WorkoutExecution, maxHR: number): Promise<SteadyStateSegment[]> {
    const segments: SteadyStateSegment[] = [];

    // Get all HR data for this workout
    const hrMetrics = await this.cardioMetricsRepository.findMany({
      filter: {
        workoutExecutionId: execution.id,
        metricType: CardioMetricType.HEART_RATE,
      },
      sort: [{ field: 'recorded_at', direction: 'asc' }],
    });

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
    const windowSize = this.MIN_SEGMENT_DURATION_SEC;
    const metrics = this.alignMetrics(hrMetrics, paceMetrics);

    let windowStart = 0;
    while (windowStart < metrics.length) {
      const windowEnd = this.findWindowEnd(metrics, windowStart, windowSize);
      if (windowEnd === -1) break;

      const windowMetrics = metrics.slice(windowStart, windowEnd + 1);
      const hrValues = windowMetrics.map((m) => m.hr);

      const avgHR = this.average(hrValues);
      const hrVariance = this.variance(hrValues);
      const hrVariancePercent = (Math.sqrt(hrVariance) / avgHR) * 100;

      // Check if HR is stable enough
      if (hrVariancePercent <= this.MAX_HR_VARIANCE_PERCENT && avgHR > maxHR * 0.5) {
        const startTime = windowMetrics[0].timestamp;
        const endTime = windowMetrics[windowMetrics.length - 1].timestamp;
        const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

        // Calculate average pace for segment
        const avgPace = this.average(windowMetrics.filter((m) => m.pace > 0).map((m) => m.pace));
        if (avgPace > 0) {
          // Convert pace (min/km) to m/min
          const paceMetersPerMin = 1000 / avgPace;
          const distanceMeters = paceMetersPerMin * (durationSeconds / 60);

          segments.push({
            startTime,
            endTime,
            avgHR,
            hrVariance: hrVariancePercent,
            distanceMeters,
            durationSeconds,
            paceMetersPerMin,
          });
        }
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
      sumX2 = 0,
      _sumY2 = 0;

    for (const point of dataPoints) {
      sumX += point.hrPercent;
      sumY += point.paceMetersPerMin;
      sumXY += point.hrPercent * point.paceMetersPerMin;
      sumX2 += point.hrPercent * point.hrPercent;
      _sumY2 += point.paceMetersPerMin * point.paceMetersPerMin;
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
      ssTotal += (point.paceMetersPerMin - meanY) ** 2;
      ssResidual += (point.paceMetersPerMin - predicted) ** 2;
    }

    const rSquared = ssTotal === 0 ? 0 : 1 - ssResidual / ssTotal;

    return { slope, intercept, rSquared: Math.max(0, rSquared) };
  }

  private calculateConfidence(rSquared: number, dataPoints: number): number {
    // Base confidence from R²
    let confidence = rSquared * 0.7;

    // Bonus for more data points (up to 30% bonus)
    const dataBonus = Math.min(0.3, (dataPoints - this.MIN_SEGMENTS) * 0.03);
    confidence += dataBonus;

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

  async getLatestVo2Max(userId: string): Promise<Vo2MaxResult | null> {
    const latest = await this.fitnessMetricsRepository.getLatestByType(userId, FitnessMetricType.VO2_MAX);

    if (!latest) return null;

    return {
      value: Number.parseFloat(latest.value),
      confidence: Number.parseFloat(latest.confidence || '0'),
      dataPointsUsed: latest.metadata?.dataPointsUsed || 0,
      algorithm: latest.metadata?.algorithm || 'unknown',
    };
  }

  async getVo2MaxHistory(userId: string, days: number = 90) {
    return this.fitnessMetricsRepository.getHistory(userId, FitnessMetricType.VO2_MAX, days);
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
}
