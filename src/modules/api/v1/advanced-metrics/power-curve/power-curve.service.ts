import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { Kysely } from 'kysely';
import { Database } from 'src/database/interfaces';
import { CardioMetricType } from 'src/database/interfaces/cardio-metrics-table.interface';

import {
  CPModelType,
  CriticalPowerAnalysisDTO,
  CriticalPowerDTO,
  PowerCurveCompareDTO,
  PowerCurveDTO,
  PowerCurvePointDTO,
  SeasonComparisonCurveDTO,
} from './power-curve.dto';

// Standard power curve durations in seconds
const STANDARD_DURATIONS = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];

// Durations used for CP modeling (need multiple points for curve fitting)
const CP_MODEL_DURATIONS = [180, 300, 480, 600, 720, 1200, 1800, 3600];

interface PowerDataPoint {
  workout_execution_id: string;
  recorded_at: Date;
  value: number;
}

interface BestPowerResult {
  durationSeconds: number;
  bestPowerWatts: number;
  achievedAt: Date;
  workoutExecutionId: string;
}

@Injectable()
export class PowerCurveService {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  /**
   * Get power duration curve for a user
   */
  async getPowerCurve(userId: string, days: number = 90): Promise<PowerCurveDTO> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get all power data for cycling workouts in the date range
    const powerData = await this.getPowerDataForUser(userId, startDate);

    if (powerData.length === 0) {
      return {
        curve: [],
        daysAnalyzed: days,
        workoutsAnalyzed: 0,
        userWeightKg: null,
      };
    }

    // Group power data by workout
    const workoutPowerMap = this.groupPowerDataByWorkout(powerData);
    const workoutsAnalyzed = workoutPowerMap.size;

    // Calculate best power for each standard duration
    const curve: PowerCurvePointDTO[] = [];
    for (const duration of STANDARD_DURATIONS) {
      const best = this.findBestPowerForDuration(workoutPowerMap, duration);
      if (best) {
        curve.push({
          durationSeconds: best.durationSeconds,
          bestPowerWatts: Math.round(best.bestPowerWatts),
          achievedAt: best.achievedAt.toISOString(),
          workoutExecutionId: best.workoutExecutionId,
          wattsPerKg: null, // Will be filled if we have weight data
        });
      }
    }

    // Try to get user weight for w/kg calculations
    const userWeight = await this.getUserWeight(userId);
    if (userWeight) {
      for (const point of curve) {
        point.wattsPerKg = Math.round((point.bestPowerWatts / userWeight) * 100) / 100;
      }
    }

    return {
      curve,
      daysAnalyzed: days,
      workoutsAnalyzed,
      userWeightKg: userWeight,
    };
  }

  /**
   * Calculate Critical Power using the specified model
   */
  async getCriticalPower(
    userId: string,
    days: number = 90,
    modelType: CPModelType = CPModelType.MORTON_3P,
  ): Promise<CriticalPowerDTO> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get power data
    const powerData = await this.getPowerDataForUser(userId, startDate);
    const workoutPowerMap = this.groupPowerDataByWorkout(powerData);

    // Get best power for CP model durations
    const curvePoints: PowerCurvePointDTO[] = [];
    for (const duration of CP_MODEL_DURATIONS) {
      const best = this.findBestPowerForDuration(workoutPowerMap, duration);
      if (best) {
        curvePoints.push({
          durationSeconds: best.durationSeconds,
          bestPowerWatts: Math.round(best.bestPowerWatts),
          achievedAt: best.achievedAt.toISOString(),
          workoutExecutionId: best.workoutExecutionId,
          wattsPerKg: null,
        });
      }
    }

    // Calculate CP using the selected model
    let analysis: CriticalPowerAnalysisDTO;

    if (curvePoints.length < 3) {
      // Not enough data points for modeling
      analysis = {
        modelType,
        criticalPower: 0,
        wPrime: 0,
        eftp: null,
        pMax: null,
        confidence: 0,
        r2: 0,
        dataPointsUsed: curvePoints.length,
        message: 'Insufficient data points for CP modeling. Need at least 3 maximal efforts at different durations.',
      };
    } else {
      switch (modelType) {
        case CPModelType.EFTP:
          analysis = this.calculateEftp(curvePoints);
          break;
        case CPModelType.MORTON_3P:
          analysis = this.calculateMorton3P(curvePoints);
          break;
        case CPModelType.MONOD_SCHERRER:
          analysis = this.calculateMonodScherrer(curvePoints);
          break;
        default:
          analysis = this.calculateMorton3P(curvePoints);
      }
    }

    // Get previous CP for comparison (from 30-90 days before current period)
    let previousCp: number | null = null;
    let cpChange: number | null = null;

    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - days);
    const previousPowerData = await this.getPowerDataForUserRange(userId, previousStartDate, startDate);

    if (previousPowerData.length > 0) {
      const prevWorkoutPowerMap = this.groupPowerDataByWorkout(previousPowerData);
      const prevCurvePoints: PowerCurvePointDTO[] = [];

      for (const duration of CP_MODEL_DURATIONS) {
        const best = this.findBestPowerForDuration(prevWorkoutPowerMap, duration);
        if (best) {
          prevCurvePoints.push({
            durationSeconds: best.durationSeconds,
            bestPowerWatts: Math.round(best.bestPowerWatts),
            achievedAt: best.achievedAt.toISOString(),
            workoutExecutionId: best.workoutExecutionId,
            wattsPerKg: null,
          });
        }
      }

      if (prevCurvePoints.length >= 3) {
        const prevAnalysis =
          modelType === CPModelType.EFTP
            ? this.calculateEftp(prevCurvePoints)
            : modelType === CPModelType.MONOD_SCHERRER
              ? this.calculateMonodScherrer(prevCurvePoints)
              : this.calculateMorton3P(prevCurvePoints);

        if (prevAnalysis.confidence > 0.5) {
          previousCp = prevAnalysis.criticalPower;
          cpChange = analysis.criticalPower - previousCp;
        }
      }
    }

    return {
      analysis,
      curvePoints,
      previousCp,
      cpChange,
    };
  }

  /**
   * Compare power curves across different date ranges
   */
  async comparePowerCurves(userId: string, ranges: string[]): Promise<PowerCurveCompareDTO> {
    const comparisons: SeasonComparisonCurveDTO[] = [];

    for (const range of ranges) {
      const [startStr, endStr] = range.split(':');
      const startDate = new Date(startStr);
      const endDate = new Date(endStr);
      endDate.setHours(23, 59, 59, 999);

      const powerData = await this.getPowerDataForUserRange(userId, startDate, endDate);
      const workoutPowerMap = this.groupPowerDataByWorkout(powerData);

      const curve: PowerCurvePointDTO[] = [];
      for (const duration of STANDARD_DURATIONS) {
        const best = this.findBestPowerForDuration(workoutPowerMap, duration);
        if (best) {
          curve.push({
            durationSeconds: best.durationSeconds,
            bestPowerWatts: Math.round(best.bestPowerWatts),
            achievedAt: best.achievedAt.toISOString(),
            workoutExecutionId: best.workoutExecutionId,
            wattsPerKg: null,
          });
        }
      }

      // Calculate CP for this period
      let cpAnalysis: CriticalPowerAnalysisDTO | null = null;
      const cpCurvePoints: PowerCurvePointDTO[] = [];

      for (const duration of CP_MODEL_DURATIONS) {
        const best = this.findBestPowerForDuration(workoutPowerMap, duration);
        if (best) {
          cpCurvePoints.push({
            durationSeconds: best.durationSeconds,
            bestPowerWatts: Math.round(best.bestPowerWatts),
            achievedAt: best.achievedAt.toISOString(),
            workoutExecutionId: best.workoutExecutionId,
            wattsPerKg: null,
          });
        }
      }

      if (cpCurvePoints.length >= 3) {
        cpAnalysis = this.calculateMorton3P(cpCurvePoints);
      }

      comparisons.push({
        label: `${startStr} to ${endStr}`,
        startDate: startStr,
        endDate: endStr,
        curve,
        cpAnalysis,
      });
    }

    return { comparisons };
  }

  // ==========================================
  // Private helper methods
  // ==========================================

  private async getPowerDataForUser(userId: string, startDate: Date): Promise<PowerDataPoint[]> {
    const results = await this.db
      .selectFrom('cardio_metrics')
      .innerJoin('workout_executions', 'workout_executions.id', 'cardio_metrics.workout_execution_id')
      .where('workout_executions.user_id', '=', userId)
      .where('cardio_metrics.metric_type', '=', CardioMetricType.POWER)
      .where('cardio_metrics.recorded_at', '>=', startDate)
      .select([
        'cardio_metrics.workout_execution_id',
        'cardio_metrics.recorded_at',
        'cardio_metrics.value',
      ])
      .orderBy('cardio_metrics.workout_execution_id')
      .orderBy('cardio_metrics.recorded_at')
      .execute();

    return results.map((r) => ({
      workout_execution_id: r.workout_execution_id,
      recorded_at: new Date(r.recorded_at),
      value: Number.parseFloat(r.value),
    }));
  }

  private async getPowerDataForUserRange(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PowerDataPoint[]> {
    const results = await this.db
      .selectFrom('cardio_metrics')
      .innerJoin('workout_executions', 'workout_executions.id', 'cardio_metrics.workout_execution_id')
      .where('workout_executions.user_id', '=', userId)
      .where('cardio_metrics.metric_type', '=', CardioMetricType.POWER)
      .where('cardio_metrics.recorded_at', '>=', startDate)
      .where('cardio_metrics.recorded_at', '<=', endDate)
      .select([
        'cardio_metrics.workout_execution_id',
        'cardio_metrics.recorded_at',
        'cardio_metrics.value',
      ])
      .orderBy('cardio_metrics.workout_execution_id')
      .orderBy('cardio_metrics.recorded_at')
      .execute();

    return results.map((r) => ({
      workout_execution_id: r.workout_execution_id,
      recorded_at: new Date(r.recorded_at),
      value: Number.parseFloat(r.value),
    }));
  }

  private groupPowerDataByWorkout(powerData: PowerDataPoint[]): Map<string, PowerDataPoint[]> {
    const workoutMap = new Map<string, PowerDataPoint[]>();

    for (const point of powerData) {
      const existing = workoutMap.get(point.workout_execution_id) || [];
      existing.push(point);
      workoutMap.set(point.workout_execution_id, existing);
    }

    return workoutMap;
  }

  private findBestPowerForDuration(
    workoutPowerMap: Map<string, PowerDataPoint[]>,
    durationSeconds: number,
  ): BestPowerResult | null {
    let bestResult: BestPowerResult | null = null;

    for (const [workoutId, points] of workoutPowerMap) {
      if (points.length < 2) continue;

      // Sort points by time
      const sortedPoints = [...points].sort((a, b) => a.recorded_at.getTime() - b.recorded_at.getTime());

      // Use sliding window to find best average power for the duration
      const best = this.findBestAveragePower(sortedPoints, durationSeconds);

      if (best && (!bestResult || best.power > bestResult.bestPowerWatts)) {
        bestResult = {
          durationSeconds,
          bestPowerWatts: best.power,
          achievedAt: best.achievedAt,
          workoutExecutionId: workoutId,
        };
      }
    }

    return bestResult;
  }

  private findBestAveragePower(
    points: PowerDataPoint[],
    durationSeconds: number,
  ): { power: number; achievedAt: Date } | null {
    if (points.length === 0) return null;

    const durationMs = durationSeconds * 1000;
    let bestPower = 0;
    let bestAchievedAt = points[0].recorded_at;

    // Sliding window approach
    for (let i = 0; i < points.length; i++) {
      const startTime = points[i].recorded_at.getTime();
      const endTime = startTime + durationMs;

      // Find all points within the window
      let sum = 0;
      let count = 0;

      for (let j = i; j < points.length; j++) {
        const pointTime = points[j].recorded_at.getTime();
        if (pointTime > endTime) break;

        sum += points[j].value;
        count++;
      }

      // Calculate average power for this window
      if (count > 0) {
        // Check if the window covers enough of the duration
        const lastPointInWindow = points[Math.min(i + count - 1, points.length - 1)];
        const actualDuration = lastPointInWindow.recorded_at.getTime() - startTime;

        // Only count if we have at least 80% of the requested duration covered
        if (actualDuration >= durationMs * 0.8 || count >= durationSeconds) {
          const avgPower = sum / count;
          if (avgPower > bestPower) {
            bestPower = avgPower;
            bestAchievedAt = points[i].recorded_at;
          }
        }
      }
    }

    return bestPower > 0 ? { power: bestPower, achievedAt: bestAchievedAt } : null;
  }

  private async getUserWeight(_userId: string): Promise<number | null> {
    // User weight is not currently stored in the database schema
    // This could be extended by adding weight to user_settings or daily_health_metrics
    return null;
  }

  /**
   * eFTP calculation - uses 95% of best 20-minute power
   */
  private calculateEftp(curvePoints: PowerCurvePointDTO[]): CriticalPowerAnalysisDTO {
    // Find the 20-minute power point (1200 seconds)
    const twentyMinPoint = curvePoints.find((p) => p.durationSeconds === 1200);

    if (!twentyMinPoint) {
      // Try to interpolate from nearby points
      const longerPoint = curvePoints.find((p) => p.durationSeconds > 1200);
      const shorterPoint = [...curvePoints].reverse().find((p) => p.durationSeconds < 1200);

      if (longerPoint && shorterPoint) {
        // Linear interpolation
        const ratio =
          (1200 - shorterPoint.durationSeconds) / (longerPoint.durationSeconds - shorterPoint.durationSeconds);
        const interpolatedPower =
          shorterPoint.bestPowerWatts + ratio * (longerPoint.bestPowerWatts - shorterPoint.bestPowerWatts);

        const eftp = Math.round(interpolatedPower * 0.95);
        const cp = Math.round(interpolatedPower);

        return {
          modelType: CPModelType.EFTP,
          criticalPower: cp,
          wPrime: 15000, // Default W' estimate
          eftp,
          pMax: null,
          confidence: 0.7,
          r2: 0.85,
          dataPointsUsed: curvePoints.length,
          message: 'eFTP estimated from interpolated 20-minute power',
        };
      }

      return {
        modelType: CPModelType.EFTP,
        criticalPower: 0,
        wPrime: 0,
        eftp: null,
        pMax: null,
        confidence: 0,
        r2: 0,
        dataPointsUsed: curvePoints.length,
        message: 'No 20-minute power data available for eFTP calculation',
      };
    }

    const eftp = Math.round(twentyMinPoint.bestPowerWatts * 0.95);
    const cp = twentyMinPoint.bestPowerWatts;

    // Estimate W' from 3-minute and 20-minute power difference
    const threeMinPoint = curvePoints.find((p) => p.durationSeconds === 180);
    let wPrime = 15000; // Default estimate

    if (threeMinPoint) {
      // W' ≈ (P3 - CP) * 180 seconds
      wPrime = Math.round((threeMinPoint.bestPowerWatts - cp) * 180);
      wPrime = Math.max(wPrime, 5000); // Minimum W'
    }

    return {
      modelType: CPModelType.EFTP,
      criticalPower: cp,
      wPrime,
      eftp,
      pMax: null,
      confidence: 0.85,
      r2: 0.9,
      dataPointsUsed: curvePoints.length,
      message: null,
    };
  }

  /**
   * Morton 3-parameter model: P = CP + W'/(t + τ)
   * Where τ = W'/Pmax
   */
  private calculateMorton3P(curvePoints: PowerCurvePointDTO[]): CriticalPowerAnalysisDTO {
    if (curvePoints.length < 3) {
      return {
        modelType: CPModelType.MORTON_3P,
        criticalPower: 0,
        wPrime: 0,
        eftp: null,
        pMax: null,
        confidence: 0,
        r2: 0,
        dataPointsUsed: curvePoints.length,
        message: 'Need at least 3 data points for Morton 3-parameter model',
      };
    }

    // Use non-linear least squares fitting (simplified iterative approach)
    // Initial estimates
    const sortedPoints = [...curvePoints].sort((a, b) => a.durationSeconds - b.durationSeconds);
    const shortestEffort = sortedPoints[0];
    const longestEffort = sortedPoints[sortedPoints.length - 1];

    // Initial CP estimate from longest effort
    let cp = longestEffort.bestPowerWatts * 0.95;

    // Initial W' estimate
    let wPrime = (shortestEffort.bestPowerWatts - cp) * shortestEffort.durationSeconds;
    wPrime = Math.max(wPrime, 5000);

    // Initial Pmax estimate (extrapolated to ~1 second)
    let pMax = shortestEffort.bestPowerWatts * 1.3;

    // Iterative refinement (simple gradient descent)
    const iterations = 100;
    const learningRate = 0.01;

    for (let iter = 0; iter < iterations; iter++) {
      let cpGrad = 0;
      let wPrimeGrad = 0;
      let pMaxGrad = 0;

      for (const point of curvePoints) {
        const t = point.durationSeconds;
        const tau = wPrime / pMax;
        const predicted = cp + wPrime / (t + tau);
        const error = predicted - point.bestPowerWatts;

        // Gradients
        cpGrad += 2 * error;
        wPrimeGrad += 2 * error * (1 / (t + tau) - wPrime / (pMax * (t + tau) ** 2));
        pMaxGrad += 2 * error * (wPrime ** 2 / (pMax ** 2 * (t + tau) ** 2));
      }

      // Update parameters
      cp -= learningRate * cpGrad;
      wPrime -= learningRate * wPrimeGrad * 100; // Scale for W'
      pMax -= learningRate * pMaxGrad;

      // Constraints
      cp = Math.max(cp, 50);
      wPrime = Math.max(wPrime, 1000);
      pMax = Math.max(pMax, cp * 1.5);
    }

    // Calculate R² and confidence
    const { r2, confidence } = this.calculateModelFit(curvePoints, (t) => {
      const tau = wPrime / pMax;
      return cp + wPrime / (t + tau);
    });

    return {
      modelType: CPModelType.MORTON_3P,
      criticalPower: Math.round(cp),
      wPrime: Math.round(wPrime),
      eftp: Math.round(cp * 0.95),
      pMax: Math.round(pMax),
      confidence,
      r2,
      dataPointsUsed: curvePoints.length,
      message: confidence < 0.7 ? 'Model fit quality is low. More data points recommended.' : null,
    };
  }

  /**
   * Monod-Scherrer (2-parameter) model: W = CP * t + W'
   * Rearranged: P = CP + W'/t
   */
  private calculateMonodScherrer(curvePoints: PowerCurvePointDTO[]): CriticalPowerAnalysisDTO {
    if (curvePoints.length < 2) {
      return {
        modelType: CPModelType.MONOD_SCHERRER,
        criticalPower: 0,
        wPrime: 0,
        eftp: null,
        pMax: null,
        confidence: 0,
        r2: 0,
        dataPointsUsed: curvePoints.length,
        message: 'Need at least 2 data points for Monod-Scherrer model',
      };
    }

    // Linear regression on P vs 1/t
    // P = CP + W' * (1/t)
    // y = a + b*x where y=P, x=1/t, a=CP, b=W'

    const n = curvePoints.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (const point of curvePoints) {
      const x = 1 / point.durationSeconds;
      const y = point.bestPowerWatts;

      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (Math.abs(denominator) < 0.0001) {
      return {
        modelType: CPModelType.MONOD_SCHERRER,
        criticalPower: 0,
        wPrime: 0,
        eftp: null,
        pMax: null,
        confidence: 0,
        r2: 0,
        dataPointsUsed: curvePoints.length,
        message: 'Cannot fit model - data points are too similar',
      };
    }

    const wPrime = (n * sumXY - sumX * sumY) / denominator;
    const cp = (sumY - wPrime * sumX) / n;

    // Calculate R² and confidence
    const { r2, confidence } = this.calculateModelFit(curvePoints, (t) => cp + wPrime / t);

    return {
      modelType: CPModelType.MONOD_SCHERRER,
      criticalPower: Math.round(Math.max(cp, 0)),
      wPrime: Math.round(Math.max(wPrime, 0)),
      eftp: Math.round(Math.max(cp * 0.95, 0)),
      pMax: null,
      confidence,
      r2,
      dataPointsUsed: curvePoints.length,
      message: confidence < 0.7 ? 'Model fit quality is low. More data points recommended.' : null,
    };
  }

  private calculateModelFit(
    curvePoints: PowerCurvePointDTO[],
    modelFn: (t: number) => number,
  ): { r2: number; confidence: number } {
    const n = curvePoints.length;
    if (n === 0) return { r2: 0, confidence: 0 };

    // Calculate mean of actual values
    const meanActual = curvePoints.reduce((sum, p) => sum + p.bestPowerWatts, 0) / n;

    // Calculate SS_tot and SS_res
    let ssTot = 0;
    let ssRes = 0;

    for (const point of curvePoints) {
      const predicted = modelFn(point.durationSeconds);
      const actual = point.bestPowerWatts;

      ssTot += (actual - meanActual) ** 2;
      ssRes += (actual - predicted) ** 2;
    }

    const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

    // Confidence based on R² and number of data points
    let confidence = r2;
    if (n < 4) confidence *= 0.7;
    else if (n < 6) confidence *= 0.85;

    return {
      r2: Math.round(r2 * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
    };
  }
}
