import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { Kysely } from 'kysely';
import { Database } from 'src/database/interfaces';
import { CardioMetricType } from 'src/database/interfaces/cardio-metrics-table.interface';

import {
  PowerPaceCorrelationDTO,
  PowerPacePointDTO,
  PowerSource,
  PowerZoneDTO,
  RunningEffectivenessDTO,
  RunningEffectivenessPointDTO,
  RunningPowerSummaryDTO,
  RunningPowerZonesDTO,
} from './running-power.dto';

// Power zone definitions (% of threshold power)
const POWER_ZONES = [
  { zone: 1, name: 'Active Recovery', minPct: 0, maxPct: 55, color: '#90CAF9' },
  { zone: 2, name: 'Endurance', minPct: 55, maxPct: 75, color: '#4CAF50' },
  { zone: 3, name: 'Tempo', minPct: 75, maxPct: 90, color: '#FFEB3B' },
  { zone: 4, name: 'Threshold', minPct: 90, maxPct: 105, color: '#FF9800' },
  { zone: 5, name: 'VO2max', minPct: 105, maxPct: 120, color: '#F44336' },
  { zone: 6, name: 'Anaerobic', minPct: 120, maxPct: 150, color: '#9C27B0' },
  { zone: 7, name: 'Neuromuscular', minPct: 150, maxPct: 300, color: '#212121' },
];

interface WorkoutPowerData {
  workoutExecutionId: string;
  startedAt: Date;
  durationSeconds: number;
  avgPower: number;
  maxPower: number;
  normalizedPower: number | null;
  distanceMeters: number | null;
  avgPace: number | null; // seconds per km
  source: string;
}

@Injectable()
export class RunningPowerService {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  /**
   * Get running power summary statistics
   */
  async getRunningPowerSummary(userId: string, days: number = 30): Promise<RunningPowerSummaryDTO> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const workouts = await this.getRunningWorkoutsWithPower(userId, startDate);

    if (workouts.length === 0) {
      return {
        avgPower: 0,
        maxPower: 0,
        avgNormalizedPower: 0,
        avgRunningEffectiveness: 0,
        avgFormPower: 0,
        formPowerRatio: 0,
        powerSource: PowerSource.UNKNOWN,
        workoutsAnalyzed: 0,
        totalDistanceMeters: 0,
        totalDurationSeconds: 0,
      };
    }

    // Calculate aggregates
    let totalPower = 0;
    let maxPower = 0;
    let totalNormalizedPower = 0;
    let normalizedPowerCount = 0;
    let totalDistance = 0;
    let totalDuration = 0;
    let totalEffectiveness = 0;
    let effectivenessCount = 0;

    for (const workout of workouts) {
      totalPower += workout.avgPower * workout.durationSeconds;
      totalDuration += workout.durationSeconds;

      if (workout.maxPower > maxPower) {
        maxPower = workout.maxPower;
      }

      if (workout.normalizedPower) {
        totalNormalizedPower += workout.normalizedPower;
        normalizedPowerCount++;
      }

      if (workout.distanceMeters) {
        totalDistance += workout.distanceMeters;
      }

      // Calculate running effectiveness (m/W) if we have distance and power
      if (workout.distanceMeters && workout.avgPower > 0 && workout.durationSeconds > 0) {
        const speedMps = workout.distanceMeters / workout.durationSeconds;
        const effectiveness = speedMps / workout.avgPower;
        totalEffectiveness += effectiveness;
        effectivenessCount++;
      }
    }

    const avgPower = totalDuration > 0 ? totalPower / totalDuration : 0;
    const avgNormalizedPower = normalizedPowerCount > 0 ? totalNormalizedPower / normalizedPowerCount : avgPower;
    const avgRunningEffectiveness = effectivenessCount > 0 ? totalEffectiveness / effectivenessCount : 0;

    // Estimate form power (typically ~20-25% of total power for most runners)
    const avgFormPower = avgPower * 0.22;
    const formPowerRatio = 22;

    // Detect power source
    const powerSource = this.detectPowerSource(workouts);

    return {
      avgPower: Math.round(avgPower),
      maxPower: Math.round(maxPower),
      avgNormalizedPower: Math.round(avgNormalizedPower),
      avgRunningEffectiveness: Math.round(avgRunningEffectiveness * 1000) / 1000,
      avgFormPower: Math.round(avgFormPower),
      formPowerRatio: Math.round(formPowerRatio * 10) / 10,
      powerSource,
      workoutsAnalyzed: workouts.length,
      totalDistanceMeters: Math.round(totalDistance),
      totalDurationSeconds: Math.round(totalDuration),
    };
  }

  /**
   * Get running effectiveness trend over time
   */
  async getRunningEffectiveness(userId: string, days: number = 30): Promise<RunningEffectivenessDTO> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const workouts = await this.getRunningWorkoutsWithPower(userId, startDate);

    if (workouts.length === 0) {
      return {
        trend: [],
        periodAverage: 0,
        changeFromStart: null,
        bestEffectiveness: null,
      };
    }

    const trend: RunningEffectivenessPointDTO[] = [];
    let totalEffectiveness = 0;
    let bestEffectiveness = 0;

    for (const workout of workouts) {
      if (!workout.distanceMeters || workout.avgPower <= 0 || workout.durationSeconds <= 0) {
        continue;
      }

      const speedMps = workout.distanceMeters / workout.durationSeconds;
      const effectiveness = speedMps / workout.avgPower;

      // Convert pace to sec/km
      const paceSecPerKm = workout.avgPace ?? (workout.durationSeconds / (workout.distanceMeters / 1000));

      trend.push({
        date: workout.startedAt.toISOString().split('T')[0],
        runningEffectiveness: Math.round(effectiveness * 1000) / 1000,
        avgPower: Math.round(workout.avgPower),
        avgPace: Math.round(paceSecPerKm),
        workoutExecutionId: workout.workoutExecutionId,
        distanceMeters: workout.distanceMeters,
      });

      totalEffectiveness += effectiveness;
      if (effectiveness > bestEffectiveness) {
        bestEffectiveness = effectiveness;
      }
    }

    // Sort by date
    trend.sort((a, b) => a.date.localeCompare(b.date));

    const periodAverage = trend.length > 0 ? totalEffectiveness / trend.length : 0;
    const changeFromStart =
      trend.length >= 2 ? trend[trend.length - 1].runningEffectiveness - trend[0].runningEffectiveness : null;

    return {
      trend,
      periodAverage: Math.round(periodAverage * 1000) / 1000,
      changeFromStart: changeFromStart ? Math.round(changeFromStart * 1000) / 1000 : null,
      bestEffectiveness: bestEffectiveness > 0 ? Math.round(bestEffectiveness * 1000) / 1000 : null,
    };
  }

  /**
   * Get power zone distribution
   */
  async getRunningPowerZones(userId: string, days: number = 30): Promise<RunningPowerZonesDTO> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get user's threshold power (from fitness metrics or calculate)
    const thresholdPower = await this.getThresholdPower(userId);

    if (!thresholdPower || thresholdPower === 0) {
      return {
        zones: [],
        thresholdPower: 0,
        totalTimeSeconds: 0,
        workoutsAnalyzed: 0,
      };
    }

    // Get all power data points for running workouts
    const powerData = await this.getAllRunningPowerData(userId, startDate);

    if (powerData.length === 0) {
      return {
        zones: POWER_ZONES.map((z) => ({
          zone: z.zone,
          name: z.name,
          minPower: Math.round(thresholdPower * (z.minPct / 100)),
          maxPower: Math.round(thresholdPower * (z.maxPct / 100)),
          timeInZoneSeconds: 0,
          percentageOfTotal: 0,
          color: z.color,
        })),
        thresholdPower,
        totalTimeSeconds: 0,
        workoutsAnalyzed: 0,
      };
    }

    // Count time in each zone (assuming 1 second per data point)
    const zoneTimeMap = new Map<number, number>();
    const workoutIds = new Set<string>();

    for (const point of powerData) {
      workoutIds.add(point.workout_execution_id);
      const powerPct = (point.power / thresholdPower) * 100;

      for (const zone of POWER_ZONES) {
        if (powerPct >= zone.minPct && powerPct < zone.maxPct) {
          zoneTimeMap.set(zone.zone, (zoneTimeMap.get(zone.zone) || 0) + 1);
          break;
        }
      }
    }

    const totalTime = powerData.length; // Assuming 1 second per data point

    const zones: PowerZoneDTO[] = POWER_ZONES.map((z) => {
      const timeInZone = zoneTimeMap.get(z.zone) || 0;
      return {
        zone: z.zone,
        name: z.name,
        minPower: Math.round(thresholdPower * (z.minPct / 100)),
        maxPower: Math.round(thresholdPower * (z.maxPct / 100)),
        timeInZoneSeconds: timeInZone,
        percentageOfTotal: totalTime > 0 ? Math.round((timeInZone / totalTime) * 1000) / 10 : 0,
        color: z.color,
      };
    });

    return {
      zones,
      thresholdPower,
      totalTimeSeconds: totalTime,
      workoutsAnalyzed: workoutIds.size,
    };
  }

  /**
   * Get power vs pace correlation
   */
  async getPowerPaceCorrelation(userId: string, days: number = 30): Promise<PowerPaceCorrelationDTO> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const workouts = await this.getRunningWorkoutsWithPower(userId, startDate);

    const points: PowerPacePointDTO[] = [];

    for (const workout of workouts) {
      if (!workout.avgPace || workout.avgPower <= 0) continue;

      // Estimate terrain based on power/pace ratio
      const terrain = this.estimateTerrain(workout.avgPower, workout.avgPace, workout.distanceMeters);

      points.push({
        pace: Math.round(workout.avgPace),
        power: Math.round(workout.avgPower),
        terrain,
        workoutExecutionId: workout.workoutExecutionId,
        date: workout.startedAt.toISOString().split('T')[0],
      });
    }

    if (points.length < 2) {
      return {
        points,
        correlationCoefficient: 0,
        regressionLine: { slope: 0, intercept: 0 },
        dataPointsCount: points.length,
      };
    }

    // Calculate correlation and regression
    const { correlation, slope, intercept } = this.calculateCorrelation(points);

    return {
      points,
      correlationCoefficient: Math.round(correlation * 1000) / 1000,
      regressionLine: {
        slope: Math.round(slope * 1000) / 1000,
        intercept: Math.round(intercept * 100) / 100,
      },
      dataPointsCount: points.length,
    };
  }

  // ==========================================
  // Private helper methods
  // ==========================================

  private async getRunningWorkoutsWithPower(userId: string, startDate: Date): Promise<WorkoutPowerData[]> {
    // Get workout executions with aggregated power metrics
    const results = await this.db
      .selectFrom('workout_executions as we')
      .innerJoin('cardio_metrics as cm', 'cm.workout_execution_id', 'we.id')
      .leftJoin('workout_routes as wr', 'wr.workout_execution_id', 'we.id')
      .where('we.user_id', '=', userId)
      .where('we.started_at', '>=', startDate)
      .where('cm.metric_type', '=', CardioMetricType.POWER)
      .select([
        'we.id as workout_execution_id',
        'we.started_at',
        'we.duration_seconds',
        'we.source',
        'wr.total_distance_meters',
      ])
      .select((eb) => [
        eb.fn.avg<string>('cm.value').as('avg_power'),
        eb.fn.max<string>('cm.value').as('max_power'),
      ])
      .groupBy(['we.id', 'we.started_at', 'we.duration_seconds', 'we.source', 'wr.total_distance_meters'])
      .execute();

    return results.map((r) => {
      const durationSeconds = r.duration_seconds || 0;
      const distanceMeters = r.total_distance_meters ? Number(r.total_distance_meters) : null;
      const avgPace = distanceMeters && durationSeconds > 0 ? durationSeconds / (distanceMeters / 1000) : null;

      return {
        workoutExecutionId: r.workout_execution_id as string,
        startedAt: new Date(r.started_at),
        durationSeconds,
        avgPower: Number.parseFloat(r.avg_power) || 0,
        maxPower: Number.parseFloat(r.max_power) || 0,
        normalizedPower: null, // Would need more complex calculation
        distanceMeters,
        avgPace,
        source: r.source,
      };
    });
  }

  private async getAllRunningPowerData(
    userId: string,
    startDate: Date,
  ): Promise<Array<{ workout_execution_id: string; power: number }>> {
    const results = await this.db
      .selectFrom('cardio_metrics as cm')
      .innerJoin('workout_executions as we', 'we.id', 'cm.workout_execution_id')
      .where('we.user_id', '=', userId)
      .where('cm.metric_type', '=', CardioMetricType.POWER)
      .where('cm.recorded_at', '>=', startDate)
      .select(['cm.workout_execution_id', 'cm.value'])
      .execute();

    return results.map((r) => ({
      workout_execution_id: r.workout_execution_id,
      power: Number.parseFloat(r.value),
    }));
  }

  private async getThresholdPower(userId: string): Promise<number | null> {
    // Try to get from fitness metrics
    const metric = await this.db
      .selectFrom('fitness_metrics')
      .where('user_id', '=', userId)
      .where('metric_type', '=', 'running_ftp')
      .orderBy('calculated_at', 'desc')
      .select('value')
      .executeTakeFirst();

    if (metric) {
      return Number.parseFloat(metric.value);
    }

    // Estimate from recent workout data
    const recentPower = await this.db
      .selectFrom('cardio_metrics as cm')
      .innerJoin('workout_executions as we', 'we.id', 'cm.workout_execution_id')
      .where('we.user_id', '=', userId)
      .where('cm.metric_type', '=', CardioMetricType.POWER)
      .where('we.duration_seconds', '>=', 1200) // At least 20 minutes
      .select((eb) => eb.fn.avg<string>('cm.value').as('avg_power'))
      .executeTakeFirst();

    if (recentPower?.avg_power) {
      // Estimate threshold as ~95% of average sustained power
      return Number.parseFloat(recentPower.avg_power) * 0.95;
    }

    return null;
  }

  private detectPowerSource(workouts: WorkoutPowerData[]): PowerSource {
    // Check the most common source
    const sourceCounts = new Map<string, number>();

    for (const workout of workouts) {
      const count = sourceCounts.get(workout.source) || 0;
      sourceCounts.set(workout.source, count + 1);
    }

    let maxCount = 0;
    let primarySource = 'unknown';

    for (const [source, count] of sourceCounts) {
      if (count > maxCount) {
        maxCount = count;
        primarySource = source.toLowerCase();
      }
    }

    // Map to PowerSource enum
    if (primarySource.includes('stryd')) return PowerSource.STRYD;
    if (primarySource.includes('garmin')) return PowerSource.GARMIN;
    if (primarySource.includes('coros')) return PowerSource.COROS;
    if (primarySource.includes('polar')) return PowerSource.POLAR;

    return PowerSource.CALCULATED;
  }

  private estimateTerrain(avgPower: number, avgPace: number, distanceMeters: number | null): string {
    // Simple heuristic based on power/pace ratio
    // Higher power with slower pace suggests uphill
    // Lower power with faster pace suggests downhill

    if (!distanceMeters || avgPace <= 0) return 'unknown';

    // Calculate expected power for the pace (simplified model)
    // Typical flat running: ~200-250W at 5:00/km pace
    const expectedPowerForPace = 400 - avgPace * 0.3;
    const powerRatio = avgPower / expectedPowerForPace;

    if (powerRatio > 1.2) return 'uphill';
    if (powerRatio < 0.85) return 'downhill';
    return 'flat';
  }

  private calculateCorrelation(points: PowerPacePointDTO[]): {
    correlation: number;
    slope: number;
    intercept: number;
  } {
    const n = points.length;
    if (n < 2) return { correlation: 0, slope: 0, intercept: 0 };

    // x = pace (faster pace = lower number, so we expect negative correlation with power)
    // y = power
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;

    for (const point of points) {
      const x = point.pace;
      const y = point.power;

      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }

    const meanX = sumX / n;
    const meanY = sumY / n;

    // Correlation coefficient
    const numerator = sumXY - n * meanX * meanY;
    const denominator = Math.sqrt((sumX2 - n * meanX * meanX) * (sumY2 - n * meanY * meanY));
    const correlation = denominator !== 0 ? numerator / denominator : 0;

    // Linear regression: y = slope * x + intercept
    const slopeNumerator = n * sumXY - sumX * sumY;
    const slopeDenominator = n * sumX2 - sumX * sumX;
    const slope = slopeDenominator !== 0 ? slopeNumerator / slopeDenominator : 0;
    const intercept = meanY - slope * meanX;

    return { correlation, slope, intercept };
  }
}
