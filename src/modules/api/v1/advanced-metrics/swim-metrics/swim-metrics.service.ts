import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database } from 'src/database/interfaces';
import { CardioMetricType } from 'src/database/interfaces/cardio-metrics-table.interface';

import {
  CriticalSwimSpeedDTO,
  CSSCalculationMethod,
  PaceZoneDTO,
  StrokeBreakdownDTO,
  StrokeRateAnalysisDTO,
  StrokeRatePointDTO,
  StrokeType,
  StrokeTypeBreakdownDTO,
  SwimSummaryDTO,
  SwolfAnalysisDTO,
  SwolfPointDTO,
} from './swim-metrics.dto';

// Swim pace zone definitions (% of CSS)
const SWIM_PACE_ZONES: Array<{ zone: number; name: string; minPct: number; maxPct: number; color: string }> = [
  { zone: 1, name: 'Recovery', minPct: 115, maxPct: 200, color: '#90CAF9' }, // Slower than CSS
  { zone: 2, name: 'Endurance', minPct: 105, maxPct: 115, color: '#4CAF50' },
  { zone: 3, name: 'Tempo', minPct: 100, maxPct: 105, color: '#FFEB3B' },
  { zone: 4, name: 'Threshold', minPct: 95, maxPct: 100, color: '#FF9800' },
  { zone: 5, name: 'VO2max', minPct: 90, maxPct: 95, color: '#F44336' },
  { zone: 6, name: 'Sprint', minPct: 80, maxPct: 90, color: '#9C27B0' },
  { zone: 7, name: 'Max Speed', minPct: 0, maxPct: 80, color: '#212121' },
];

// Stroke type colors
const STROKE_COLORS: Record<StrokeType, string> = {
  [StrokeType.FREESTYLE]: '#2196F3',
  [StrokeType.BACKSTROKE]: '#4CAF50',
  [StrokeType.BREASTSTROKE]: '#FF9800',
  [StrokeType.BUTTERFLY]: '#F44336',
  [StrokeType.IM]: '#9C27B0',
  [StrokeType.DRILL]: '#607D8B',
  [StrokeType.UNKNOWN]: '#9E9E9E',
};

interface SwimWorkoutData {
  workoutExecutionId: string;
  startedAt: Date;
  durationSeconds: number;
  distanceMeters: number | null;
  avgPace: number | null; // sec/100m
  avgStrokeRate: number | null;
  avgSwolf: number | null;
  poolLength: number | null;
  isOpenWater: boolean;
  strokeType: StrokeType;
}

@Injectable()
export class SwimMetricsService {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  /**
   * Get swim summary statistics
   */
  async getSwimSummary(
    userId: string,
    days: number = 30,
    poolOnly: boolean = false,
    openWaterOnly: boolean = false,
  ): Promise<SwimSummaryDTO> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    let workouts = await this.getSwimWorkouts(userId, startDate);

    // Apply filters
    if (poolOnly) {
      workouts = workouts.filter((w) => !w.isOpenWater);
    }
    if (openWaterOnly) {
      workouts = workouts.filter((w) => w.isOpenWater);
    }

    if (workouts.length === 0) {
      return {
        totalDistance: 0,
        avgSwolf: 0,
        avgStrokeRate: 0,
        avgPace: 0,
        poolSwims: 0,
        openWaterSwims: 0,
        totalDurationSeconds: 0,
        workoutsAnalyzed: 0,
        bestSwolf: null,
        bestPace: null,
      };
    }

    let totalDistance = 0;
    let totalDuration = 0;
    let totalSwolf = 0;
    let swolfCount = 0;
    let totalStrokeRate = 0;
    let strokeRateCount = 0;
    let bestSwolf = Number.POSITIVE_INFINITY;
    let bestPace = Number.POSITIVE_INFINITY;
    let poolSwims = 0;
    let openWaterSwims = 0;

    for (const workout of workouts) {
      if (workout.distanceMeters) {
        totalDistance += workout.distanceMeters;
      }
      totalDuration += workout.durationSeconds;

      if (workout.avgSwolf && workout.avgSwolf > 0) {
        totalSwolf += workout.avgSwolf;
        swolfCount++;
        if (workout.avgSwolf < bestSwolf) {
          bestSwolf = workout.avgSwolf;
        }
      }

      if (workout.avgStrokeRate && workout.avgStrokeRate > 0) {
        totalStrokeRate += workout.avgStrokeRate;
        strokeRateCount++;
      }

      if (workout.avgPace && workout.avgPace > 0 && workout.avgPace < bestPace) {
        bestPace = workout.avgPace;
      }

      if (workout.isOpenWater) {
        openWaterSwims++;
      } else {
        poolSwims++;
      }
    }

    // Calculate average pace from total distance and duration
    const avgPace = totalDistance > 0 ? totalDuration / (totalDistance / 100) : 0;

    return {
      totalDistance: Math.round(totalDistance),
      avgSwolf: swolfCount > 0 ? Math.round(totalSwolf / swolfCount) : 0,
      avgStrokeRate: strokeRateCount > 0 ? Math.round((totalStrokeRate / strokeRateCount) * 10) / 10 : 0,
      avgPace: Math.round(avgPace * 10) / 10,
      poolSwims,
      openWaterSwims,
      totalDurationSeconds: Math.round(totalDuration),
      workoutsAnalyzed: workouts.length,
      bestSwolf: bestSwolf !== Number.POSITIVE_INFINITY ? Math.round(bestSwolf) : null,
      bestPace: bestPace !== Number.POSITIVE_INFINITY ? Math.round(bestPace * 10) / 10 : null,
    };
  }

  /**
   * Get SWOLF analysis trend
   */
  async getSwolfAnalysis(userId: string, days: number = 30): Promise<SwolfAnalysisDTO> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const workouts = await this.getSwimWorkouts(userId, startDate);
    const poolWorkouts = workouts.filter((w) => !w.isOpenWater && w.avgSwolf && w.avgSwolf > 0);

    if (poolWorkouts.length === 0) {
      return {
        trend: [],
        periodAverage: 0,
        bestSwolf: null,
        changeFromStart: null,
      };
    }

    const trend: SwolfPointDTO[] = [];
    let totalSwolf = 0;
    let bestSwolf = Number.POSITIVE_INFINITY;

    for (const workout of poolWorkouts) {
      const poolLength = workout.poolLength || 25;
      // Estimate stroke count from SWOLF and pool length
      // SWOLF = stroke count + time for length
      // Assume ~1.5 sec per stroke, so strokes ≈ SWOLF * 0.6 (rough estimate)
      const estimatedStrokeCount = Math.round((workout.avgSwolf || 0) * 0.5);
      const timePerLength = (workout.avgSwolf || 0) - estimatedStrokeCount;

      trend.push({
        date: workout.startedAt.toISOString().split('T')[0],
        swolf: Math.round(workout.avgSwolf || 0),
        strokeCount: estimatedStrokeCount,
        timePerLength: Math.round(timePerLength * 10) / 10,
        poolLength,
        workoutExecutionId: workout.workoutExecutionId,
        distanceMeters: workout.distanceMeters,
      });

      totalSwolf += workout.avgSwolf || 0;
      if ((workout.avgSwolf || Number.POSITIVE_INFINITY) < bestSwolf) {
        bestSwolf = workout.avgSwolf || Number.POSITIVE_INFINITY;
      }
    }

    // Sort by date
    trend.sort((a, b) => a.date.localeCompare(b.date));

    const periodAverage = trend.length > 0 ? totalSwolf / trend.length : 0;
    const changeFromStart = trend.length >= 2 ? trend[trend.length - 1].swolf - trend[0].swolf : null;

    return {
      trend,
      periodAverage: Math.round(periodAverage),
      bestSwolf: bestSwolf !== Number.POSITIVE_INFINITY ? Math.round(bestSwolf) : null,
      changeFromStart,
    };
  }

  /**
   * Get stroke rate analysis
   */
  async getStrokeRateAnalysis(userId: string, days: number = 30): Promise<StrokeRateAnalysisDTO> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const workouts = await this.getSwimWorkouts(userId, startDate);
    const validWorkouts = workouts.filter(
      (w) => w.avgStrokeRate && w.avgStrokeRate > 0 && w.distanceMeters && w.durationSeconds > 0,
    );

    if (validWorkouts.length === 0) {
      return {
        trend: [],
        periodAverageRate: 0,
        periodAverageDPS: 0,
        bestDPS: null,
      };
    }

    const trend: StrokeRatePointDTO[] = [];
    let totalRate = 0;
    let totalDPS = 0;
    let bestDPS = 0;

    for (const workout of validWorkouts) {
      const strokeRate = workout.avgStrokeRate || 0;
      const totalStrokes = strokeRate * (workout.durationSeconds / 60);
      const distancePerStroke = totalStrokes > 0 ? (workout.distanceMeters || 0) / totalStrokes : 0;
      const avgPace = workout.avgPace || workout.durationSeconds / ((workout.distanceMeters || 1) / 100);

      trend.push({
        date: workout.startedAt.toISOString().split('T')[0],
        strokeRate: Math.round(strokeRate * 10) / 10,
        distancePerStroke: Math.round(distancePerStroke * 100) / 100,
        avgPace: Math.round(avgPace * 10) / 10,
        workoutExecutionId: workout.workoutExecutionId,
      });

      totalRate += strokeRate;
      totalDPS += distancePerStroke;
      if (distancePerStroke > bestDPS) {
        bestDPS = distancePerStroke;
      }
    }

    // Sort by date
    trend.sort((a, b) => a.date.localeCompare(b.date));

    return {
      trend,
      periodAverageRate: Math.round((totalRate / validWorkouts.length) * 10) / 10,
      periodAverageDPS: Math.round((totalDPS / validWorkouts.length) * 100) / 100,
      bestDPS: bestDPS > 0 ? Math.round(bestDPS * 100) / 100 : null,
    };
  }

  /**
   * Calculate Critical Swim Speed (CSS)
   */
  async getCriticalSwimSpeed(userId: string, days: number = 90): Promise<CriticalSwimSpeedDTO> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const workouts = await this.getSwimWorkouts(userId, startDate);

    // Try to find time trial efforts
    // Look for efforts at specific distances: 400m, 200m, 1000m, 500m
    const efforts = await this.findTimeTrialEfforts(workouts);

    let css: number;
    let method: CSSCalculationMethod;
    let confidence: number;
    let message: string | null = null;

    if (efforts.tt400 && efforts.tt200) {
      // Preferred method: (400m time - 200m time) / (400m - 200m) = pace difference
      // CSS = 400m / ((400m time - 200m time) / 200) = adjusted pace
      const timeDiff = efforts.tt400 - efforts.tt200;
      css = timeDiff / 2; // Time per 100m at CSS
      method = CSSCalculationMethod.TT_400_200;
      confidence = 0.9;
    } else if (efforts.tt1000 && efforts.tt500) {
      // Alternative: 1000m and 500m time trials
      const timeDiff = efforts.tt1000 - efforts.tt500;
      css = timeDiff / 5; // Time per 100m at CSS
      method = CSSCalculationMethod.TT_1000_500;
      confidence = 0.85;
    } else {
      // Estimate from pace curve (less accurate)
      const avgPaces = workouts
        .filter((w) => w.avgPace && w.avgPace > 0 && w.distanceMeters && w.distanceMeters >= 500)
        .map((w) => w.avgPace || 0);

      if (avgPaces.length > 0) {
        // CSS is roughly the pace you can hold for 30 minutes
        // Estimate as 95th percentile of sustained paces
        avgPaces.sort((a, b) => a - b);
        const idx = Math.floor(avgPaces.length * 0.3); // ~30th percentile (faster paces)
        css = avgPaces[idx];
        method = CSSCalculationMethod.PACE_CURVE;
        confidence = 0.6;
        message = 'CSS estimated from workout paces. Perform 400m and 200m time trials for more accurate results.';
      } else {
        // No data available
        return {
          css: 0,
          calculationMethod: CSSCalculationMethod.PACE_CURVE,
          paceZones: [],
          confidence: 0,
          previousCss: null,
          cssChange: null,
          message: 'Insufficient swim data to calculate CSS. Record more swim workouts.',
        };
      }
    }

    // Generate pace zones based on CSS
    const paceZones: PaceZoneDTO[] = SWIM_PACE_ZONES.map((zone) => ({
      zone: zone.zone,
      name: zone.name,
      // For swim, slower pace = higher number, so min/max are inverted
      minPace: Math.round(css * (zone.maxPct / 100) * 10) / 10,
      maxPace: Math.round(css * (zone.minPct / 100) * 10) / 10,
      color: zone.color,
    }));

    // Try to get previous CSS for comparison
    const previousPeriodStart = new Date(startDate);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - days);
    // Simplified: just return null for now (would need historical calculations)

    return {
      css: Math.round(css * 10) / 10,
      calculationMethod: method,
      paceZones,
      confidence,
      previousCss: null,
      cssChange: null,
      message,
    };
  }

  /**
   * Get stroke type breakdown
   */
  async getStrokeBreakdown(userId: string, days: number = 30): Promise<StrokeBreakdownDTO> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const workouts = await this.getSwimWorkouts(userId, startDate);

    if (workouts.length === 0) {
      return {
        breakdown: [],
        totalDistance: 0,
        workoutsAnalyzed: 0,
      };
    }

    // Group by stroke type
    const strokeData = new Map<
      StrokeType,
      {
        distance: number;
        totalPace: number;
        paceCount: number;
        totalSwolf: number;
        swolfCount: number;
        sessions: number;
      }
    >();

    let totalDistance = 0;

    for (const workout of workouts) {
      const stroke = workout.strokeType;
      const existing = strokeData.get(stroke) || {
        distance: 0,
        totalPace: 0,
        paceCount: 0,
        totalSwolf: 0,
        swolfCount: 0,
        sessions: 0,
      };

      if (workout.distanceMeters) {
        existing.distance += workout.distanceMeters;
        totalDistance += workout.distanceMeters;
      }

      if (workout.avgPace && workout.avgPace > 0) {
        existing.totalPace += workout.avgPace;
        existing.paceCount++;
      }

      if (workout.avgSwolf && workout.avgSwolf > 0) {
        existing.totalSwolf += workout.avgSwolf;
        existing.swolfCount++;
      }

      existing.sessions++;
      strokeData.set(stroke, existing);
    }

    const breakdown: StrokeTypeBreakdownDTO[] = [];

    for (const [strokeType, data] of strokeData) {
      breakdown.push({
        strokeType,
        totalDistance: Math.round(data.distance),
        avgPace: data.paceCount > 0 ? Math.round((data.totalPace / data.paceCount) * 10) / 10 : 0,
        avgSwolf: data.swolfCount > 0 ? Math.round(data.totalSwolf / data.swolfCount) : 0,
        percentageOfTotal: totalDistance > 0 ? Math.round((data.distance / totalDistance) * 1000) / 10 : 0,
        sessionCount: data.sessions,
        color: STROKE_COLORS[strokeType],
      });
    }

    // Sort by distance (descending)
    breakdown.sort((a, b) => b.totalDistance - a.totalDistance);

    return {
      breakdown,
      totalDistance: Math.round(totalDistance),
      workoutsAnalyzed: workouts.length,
    };
  }

  // ==========================================
  // Private helper methods
  // ==========================================

  private async getSwimWorkouts(userId: string, startDate: Date): Promise<SwimWorkoutData[]> {
    // Query workouts with swim-related metrics
    const results = await this.db
      .selectFrom('workout_executions as we')
      .leftJoin('workout_routes as wr', 'wr.workout_execution_id', 'we.id')
      .leftJoin('cardio_metrics as cm', (join) =>
        join.onRef('cm.workout_execution_id', '=', 'we.id').on('cm.metric_type', '=', CardioMetricType.CADENCE),
      )
      .where('we.user_id', '=', userId)
      .where('we.started_at', '>=', startDate)
      // Filter for swim workouts - this would ideally check workout type
      // For now, we'll identify swims by looking at cadence patterns typical of swimming
      .select(['we.id as workout_execution_id', 'we.started_at', 'we.duration_seconds', 'wr.total_distance_meters'])
      .select((eb) => eb.fn.avg<string>('cm.value').as('avg_cadence'))
      .groupBy(['we.id', 'we.started_at', 'we.duration_seconds', 'wr.total_distance_meters'])
      .execute();

    // Filter and process swim workouts
    // Swimming typically has lower cadence (stroke rate ~20-60 spm) vs running (~160-200)
    const swimWorkouts: SwimWorkoutData[] = [];

    for (const r of results) {
      const avgCadence = r.avg_cadence ? Number.parseFloat(r.avg_cadence) : null;

      // Check if this looks like a swim (low cadence or null cadence with reasonable distance)
      const looksLikeSwim =
        (avgCadence !== null && avgCadence < 80) ||
        (r.total_distance_meters && Number(r.total_distance_meters) > 100 && Number(r.total_distance_meters) < 10000);

      if (!looksLikeSwim && avgCadence !== null) continue;

      const durationSeconds = r.duration_seconds || 0;
      const distanceMeters = r.total_distance_meters ? Number(r.total_distance_meters) : null;
      const avgPace = distanceMeters && durationSeconds > 0 ? durationSeconds / (distanceMeters / 100) : null;

      // Estimate SWOLF from cadence and pace
      // SWOLF = strokes per length + seconds per length
      let avgSwolf: number | null = null;
      const poolLength = 25; // Default assumption

      if (avgCadence && avgPace && avgPace > 0) {
        const strokesPerMinute = avgCadence;
        const secondsPerLength = avgPace * (poolLength / 100);
        const strokesPerLength = (strokesPerMinute / 60) * secondsPerLength;
        avgSwolf = strokesPerLength + secondsPerLength;
      }

      swimWorkouts.push({
        workoutExecutionId: r.workout_execution_id,
        startedAt: new Date(r.started_at),
        durationSeconds,
        distanceMeters,
        avgPace,
        avgStrokeRate: avgCadence,
        avgSwolf,
        poolLength,
        isOpenWater: distanceMeters !== null && distanceMeters > 2000, // Assume >2km is open water
        strokeType: StrokeType.FREESTYLE, // Default to freestyle without more data
      });
    }

    return swimWorkouts;
  }

  private async findTimeTrialEfforts(workouts: SwimWorkoutData[]): Promise<{
    tt400?: number;
    tt200?: number;
    tt1000?: number;
    tt500?: number;
  }> {
    const efforts: { tt400?: number; tt200?: number; tt1000?: number; tt500?: number } = {};

    // Find best times at target distances
    for (const workout of workouts) {
      if (!workout.distanceMeters || !workout.avgPace) continue;

      const distance = workout.distanceMeters;
      const totalTime = (workout.avgPace * distance) / 100;

      // Check for ~200m efforts
      if (distance >= 190 && distance <= 210 && (!efforts.tt200 || totalTime < efforts.tt200)) {
        efforts.tt200 = totalTime;
      }

      // Check for ~400m efforts
      if (distance >= 380 && distance <= 420 && (!efforts.tt400 || totalTime < efforts.tt400)) {
        efforts.tt400 = totalTime;
      }

      // Check for ~500m efforts
      if (distance >= 480 && distance <= 520 && (!efforts.tt500 || totalTime < efforts.tt500)) {
        efforts.tt500 = totalTime;
      }

      // Check for ~1000m efforts
      if (distance >= 950 && distance <= 1050 && (!efforts.tt1000 || totalTime < efforts.tt1000)) {
        efforts.tt1000 = totalTime;
      }
    }

    return efforts;
  }
}
