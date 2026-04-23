import { BadRequestException, Injectable } from '@nestjs/common';
import { type Request } from 'express';
import { formatDateToYMD } from 'src/lib/util';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { FitnessFatigueRepository } from 'src/repositories/fitness-fatigue.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { HrvBaselineRepository } from 'src/repositories/hrv-baseline.repository';
import { MultiStreamLoadRepository } from 'src/repositories/multi-stream-load.repository';
import { QuickWellnessCheckinRepository } from 'src/repositories/quick-wellness-checkin.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

import { MetricHistoryQuery, PeriodComparisonQuery } from './request.dto';
import {
  AvailableMetricsResponse,
  MetricChapterDTO,
  MetricDataPointDTO,
  MetricHistoryDTO,
  MetricHistoryResponse,
  MetricSummaryDTO,
  PeriodComparisonDTO,
  PeriodComparisonResponse,
  PeriodWorkoutSummaryDTO,
} from './response.dto';

// Metric chapters configuration
const METRIC_CHAPTERS: MetricChapterDTO[] = [
  {
    chapter: 'Wellness',
    metrics: [
      { id: 'sleepQuality', label: 'Sleep Quality', unit: '/5' },
      { id: 'energyLevel', label: 'Energy Level', unit: '/5' },
      { id: 'muscleSoreness', label: 'Muscle Soreness', unit: '/5' },
      { id: 'stressLevel', label: 'Stress Level', unit: '/5' },
      { id: 'trainingReadiness', label: 'Training Readiness', unit: '/5' },
    ],
  },
  {
    chapter: 'Training Load',
    metrics: [
      { id: 'ctl', label: 'Fitness (CTL)', unit: '' },
      { id: 'atl', label: 'Fatigue (ATL)', unit: '' },
      { id: 'tsb', label: 'Form (TSB)', unit: '' },
      { id: 'dailyTss', label: 'Daily TSS', unit: '' },
    ],
  },
  {
    chapter: 'Recovery',
    metrics: [
      { id: 'readinessScore', label: 'Readiness Score', unit: '/100' },
      { id: 'hrvValue', label: 'HRV', unit: 'ms' },
      { id: 'restingHr', label: 'Resting Heart Rate', unit: 'bpm' },
      { id: 'sleepDuration', label: 'Sleep Duration', unit: 'h' },
    ],
  },
  {
    chapter: 'Strength',
    metrics: [
      { id: 'totalVolume', label: 'Total Volume', unit: 'kg' },
      { id: 'totalSets', label: 'Total Sets', unit: '' },
      { id: 'totalReps', label: 'Total Reps', unit: '' },
    ],
  },
  {
    chapter: 'Cardio',
    metrics: [
      { id: 'vo2max', label: 'VO2 Max', unit: 'ml/kg/min' },
      { id: 'lthr', label: 'Lactate Threshold HR', unit: 'bpm' },
      { id: 'lthrRunning', label: 'LTHR (Running)', unit: 'bpm' },
      { id: 'lthrCycling', label: 'LTHR (Cycling)', unit: 'bpm' },
    ],
  },
];

// Flat lookup for metric info
const METRIC_INFO_MAP = new Map(
  METRIC_CHAPTERS.flatMap((chapter) => chapter.metrics.map((m) => [m.id, { label: m.label, unit: m.unit }])),
);

@Injectable()
export class ExploreApiService {
  constructor(
    private readonly quickWellnessCheckinRepository: QuickWellnessCheckinRepository,
    private readonly fitnessFatigueRepository: FitnessFatigueRepository,
    private readonly multiStreamLoadRepository: MultiStreamLoadRepository,
    private readonly hrvBaselineRepository: HrvBaselineRepository,
    private readonly sleepLogRepository: SleepLogRepository,
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly workoutRouteRepository: WorkoutRouteRepository,
    private readonly setCompletionRepository: SetCompletionRepository,
    private readonly fitnessMetricsRepository: FitnessMetricsRepository,
  ) {}

  /**
   * Get available metrics with chapters
   */
  async getAvailableMetrics(): Promise<AvailableMetricsResponse> {
    return { data: METRIC_CHAPTERS };
  }

  /**
   * Get metric history for a given metric and date range
   */
  async getMetricHistory(
    req: Request & { user: AuthUser },
    metricId: string,
    query: MetricHistoryQuery,
  ): Promise<MetricHistoryResponse> {
    const userId = req.user.id;
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    // Validate dates
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be before endDate');
    }

    const metricInfo = METRIC_INFO_MAP.get(metricId);
    if (!metricInfo) {
      throw new BadRequestException(`Unknown metric: ${metricId}`);
    }

    // Route to appropriate data fetcher
    const dataPoints = await this.fetchMetricData(userId, metricId, startDate, endDate);

    // Calculate summary
    const summary = this.calculateSummary(dataPoints);

    const data: MetricHistoryDTO = {
      metricId,
      metricLabel: metricInfo.label,
      unit: metricInfo.unit,
      dataPoints,
      summary,
    };

    return { data };
  }

  /**
   * Get period comparison for workout summary
   */
  async getPeriodComparison(
    req: Request & { user: AuthUser },
    query: PeriodComparisonQuery,
  ): Promise<PeriodComparisonResponse> {
    const userId = req.user.id;

    const currentStart = new Date(query.currentStart);
    const currentEnd = new Date(query.currentEnd);

    // Calculate previous period if not provided
    let previousStart: Date;
    let previousEnd: Date;

    if (query.previousStart && query.previousEnd) {
      previousStart = new Date(query.previousStart);
      previousEnd = new Date(query.previousEnd);
    } else {
      // Auto-calculate: same length period immediately before
      const periodLength = currentEnd.getTime() - currentStart.getTime();
      previousEnd = new Date(currentStart.getTime() - 24 * 60 * 60 * 1000); // Day before current start
      previousStart = new Date(previousEnd.getTime() - periodLength);
    }

    // Fetch summaries for both periods
    const [current, previous] = await Promise.all([
      this.calculateWorkoutSummary(userId, currentStart, currentEnd),
      this.calculateWorkoutSummary(userId, previousStart, previousEnd),
    ]);

    const data: PeriodComparisonDTO = {
      current,
      previous,
      currentPeriodStart: formatDateToYMD(currentStart),
      currentPeriodEnd: formatDateToYMD(currentEnd),
      previousPeriodStart: formatDateToYMD(previousStart),
      previousPeriodEnd: formatDateToYMD(previousEnd),
    };

    return { data };
  }

  /**
   * Fetch metric data based on metric type
   */
  private async fetchMetricData(
    userId: string,
    metricId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<MetricDataPointDTO[]> {
    switch (metricId) {
      // Wellness metrics
      case 'sleepQuality':
      case 'energyLevel':
      case 'muscleSoreness':
      case 'stressLevel':
      case 'trainingReadiness':
        return this.fetchWellnessMetric(userId, metricId, startDate, endDate);

      // Training load metrics
      case 'ctl':
      case 'atl':
      case 'tsb':
      case 'dailyTss':
        return this.fetchFitnessFatigueMetric(userId, metricId, startDate, endDate);

      // Recovery metrics
      case 'readinessScore':
        return this.fetchReadinessMetric(userId, startDate, endDate);
      case 'hrvValue':
      case 'restingHr':
        return this.fetchHrvMetric(userId, metricId, startDate, endDate);
      case 'sleepDuration':
        return this.fetchSleepDurationMetric(userId, startDate, endDate);

      // Strength metrics
      case 'totalVolume':
      case 'totalSets':
      case 'totalReps':
        return this.fetchStrengthMetric(userId, metricId, startDate, endDate);

      // Cardio metrics
      case 'vo2max':
        return this.fetchVo2MaxMetric(userId, startDate, endDate);
      case 'lthr':
        return this.fetchLthrMetric(userId, 'lthr', startDate, endDate);
      case 'lthrRunning':
        return this.fetchLthrMetric(userId, 'lthr_running', startDate, endDate);
      case 'lthrCycling':
        return this.fetchLthrMetric(userId, 'lthr_cycling', startDate, endDate);

      default:
        throw new BadRequestException(`Metric ${metricId} not implemented`);
    }
  }

  /**
   * Fetch wellness check-in metrics
   */
  private async fetchWellnessMetric(
    userId: string,
    metricId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<MetricDataPointDTO[]> {
    const checkins = await this.quickWellnessCheckinRepository.findMany({
      filter: {
        userId,
        dateFrom: startDate,
        dateTo: endDate,
      },
    });

    // Create a map of date -> value
    const valueMap = new Map<string, number | null>();
    for (const checkin of checkins) {
      const date =
        checkin.checkin_date instanceof Date ? formatDateToYMD(checkin.checkin_date) : String(checkin.checkin_date);

      let value: number | null = null;
      switch (metricId) {
        case 'sleepQuality':
          value = checkin.sleep_quality;
          break;
        case 'energyLevel':
          value = checkin.energy_level;
          break;
        case 'muscleSoreness':
          value = checkin.muscle_soreness;
          break;
        case 'stressLevel':
          value = checkin.stress_level;
          break;
        case 'trainingReadiness':
          value = checkin.training_readiness;
          break;
      }
      valueMap.set(date, value);
    }

    // Generate all dates in range
    return this.generateDateRange(startDate, endDate, valueMap);
  }

  /**
   * Fetch fitness-fatigue (PMC) metrics
   */
  private async fetchFitnessFatigueMetric(
    userId: string,
    metricId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<MetricDataPointDTO[]> {
    const data = await this.fitnessFatigueRepository.findMany({
      filter: { userId, dateFrom: startDate, dateTo: endDate },
      sort: [{ field: 'date', direction: 'asc' }],
    });

    const valueMap = new Map<string, number | null>();
    for (const entry of data) {
      const date = entry.date instanceof Date ? formatDateToYMD(entry.date) : String(entry.date);

      let value: number | null = null;
      switch (metricId) {
        case 'ctl':
          value = entry.ctl ? Number(entry.ctl) : null;
          break;
        case 'atl':
          value = entry.atl ? Number(entry.atl) : null;
          break;
        case 'tsb':
          value = entry.tsb ? Number(entry.tsb) : null;
          break;
        case 'dailyTss':
          value = entry.daily_tss ? Number(entry.daily_tss) : null;
          break;
      }
      valueMap.set(date, value);
    }

    return this.generateDateRange(startDate, endDate, valueMap);
  }

  /**
   * Fetch readiness score from multi-stream load
   */
  private async fetchReadinessMetric(userId: string, startDate: Date, endDate: Date): Promise<MetricDataPointDTO[]> {
    const data = await this.multiStreamLoadRepository.findMany({
      filter: { userId, dateFrom: startDate, dateTo: endDate },
      sort: [{ field: 'date', direction: 'asc' }],
    });

    const valueMap = new Map<string, number | null>();
    for (const entry of data) {
      const date = entry.date instanceof Date ? formatDateToYMD(entry.date) : String(entry.date);
      valueMap.set(date, entry.readiness_score ? Number(entry.readiness_score) : null);
    }

    return this.generateDateRange(startDate, endDate, valueMap);
  }

  /**
   * Fetch HRV or resting HR metrics
   */
  private async fetchHrvMetric(
    userId: string,
    metricId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<MetricDataPointDTO[]> {
    const data = await this.hrvBaselineRepository.findMany({
      filter: { userId, dateFrom: startDate, dateTo: endDate },
      sort: [{ field: 'date', direction: 'asc' }],
    });

    const valueMap = new Map<string, number | null>();
    for (const entry of data) {
      const date = entry.date instanceof Date ? formatDateToYMD(entry.date) : String(entry.date);

      let value: number | null = null;
      switch (metricId) {
        case 'hrvValue':
          value = entry.hrv_value ? Number(entry.hrv_value) : null;
          break;
        case 'restingHr':
          value = entry.resting_hr ? Number(entry.resting_hr) : null;
          break;
      }
      valueMap.set(date, value);
    }

    return this.generateDateRange(startDate, endDate, valueMap);
  }

  /**
   * Fetch sleep duration from sleep logs
   */
  private async fetchSleepDurationMetric(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<MetricDataPointDTO[]> {
    const data = await this.sleepLogRepository.findMany({
      filter: {
        userId,
        startDate,
        endDate,
      },
    });

    const valueMap = new Map<string, number | null>();
    for (const entry of data) {
      const date = entry.log_date instanceof Date ? formatDateToYMD(entry.log_date) : String(entry.log_date);
      // Convert seconds to hours
      const durationHours = entry.total_duration_seconds
        ? Math.round((Number(entry.total_duration_seconds) / 3600) * 10) / 10
        : null;
      valueMap.set(date, durationHours);
    }

    return this.generateDateRange(startDate, endDate, valueMap);
  }

  /**
   * Fetch strength metrics (volume, sets, reps) aggregated by day
   */
  private async fetchStrengthMetric(
    userId: string,
    metricId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<MetricDataPointDTO[]> {
    // Get all workout executions in range
    const executions = await this.workoutExecutionRepository.findMany({
      filter: {
        userId,
        completedDateFrom: startDate,
        completedDateTo: endDate,
        completed: true,
      },
    });

    // Aggregate by date
    const dailyStats = new Map<string, { volume: number; sets: number; reps: number }>();

    for (const execution of executions) {
      const date =
        execution.completed_at instanceof Date
          ? formatDateToYMD(execution.completed_at)
          : formatDateToYMD(new Date(execution.completed_at!));

      const existing = dailyStats.get(date) || { volume: 0, sets: 0, reps: 0 };

      // Get set completions for this execution
      const sets = await this.setCompletionRepository.findMany({
        filter: { workoutExecutionId: execution.id },
      });

      for (const set of sets) {
        if (!set.skipped) {
          existing.sets++;
          existing.reps += set.actual_reps || 0;
          const load = set.actual_load ? Number(set.actual_load) : 0;
          const reps = set.actual_reps || 0;
          existing.volume += load * reps;
        }
      }

      dailyStats.set(date, existing);
    }

    // Convert to data points
    const valueMap = new Map<string, number | null>();
    for (const [date, stats] of dailyStats) {
      switch (metricId) {
        case 'totalVolume':
          valueMap.set(date, stats.volume > 0 ? Math.round(stats.volume) : null);
          break;
        case 'totalSets':
          valueMap.set(date, stats.sets > 0 ? stats.sets : null);
          break;
        case 'totalReps':
          valueMap.set(date, stats.reps > 0 ? stats.reps : null);
          break;
      }
    }

    return this.generateDateRange(startDate, endDate, valueMap);
  }

  /**
   * Fetch VO2 max from fitness metrics
   */
  private async fetchVo2MaxMetric(userId: string, startDate: Date, endDate: Date): Promise<MetricDataPointDTO[]> {
    const data = await this.fitnessMetricsRepository.findMany({
      filter: {
        userId,
        metricType: 'vo2_max' as any,
        dateFrom: startDate,
        dateTo: endDate,
      },
      sort: [{ field: 'calculated_at', direction: 'asc' }],
    });

    const valueMap = new Map<string, number | null>();
    for (const entry of data) {
      const date =
        entry.calculated_at instanceof Date
          ? formatDateToYMD(entry.calculated_at)
          : formatDateToYMD(new Date(entry.calculated_at));
      valueMap.set(date, entry.value ? Number(entry.value) : null);
    }

    return this.generateDateRange(startDate, endDate, valueMap);
  }

  /**
   * Fetch LTHR (Lactate Threshold Heart Rate) from fitness metrics
   */
  private async fetchLthrMetric(
    userId: string,
    metricType: string,
    startDate: Date,
    endDate: Date,
  ): Promise<MetricDataPointDTO[]> {
    const data = await this.fitnessMetricsRepository.findMany({
      filter: {
        userId,
        metricType: metricType as any,
        dateFrom: startDate,
        dateTo: endDate,
      },
      sort: [{ field: 'calculated_at', direction: 'asc' }],
    });

    const valueMap = new Map<string, number | null>();
    for (const entry of data) {
      const date =
        entry.calculated_at instanceof Date
          ? formatDateToYMD(entry.calculated_at)
          : formatDateToYMD(new Date(entry.calculated_at));
      valueMap.set(date, entry.value ? Number(entry.value) : null);
    }

    return this.generateDateRange(startDate, endDate, valueMap);
  }

  /**
   * Generate all dates in a range with values from map
   */
  private generateDateRange(
    startDate: Date,
    endDate: Date,
    valueMap: Map<string, number | null>,
  ): MetricDataPointDTO[] {
    const result: MetricDataPointDTO[] = [];
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    while (current <= end) {
      const dateStr = formatDateToYMD(current);
      result.push({
        date: dateStr,
        value: valueMap.get(dateStr) ?? null,
      });
      current.setDate(current.getDate() + 1);
    }

    return result;
  }

  /**
   * Calculate summary statistics for data points
   */
  private calculateSummary(dataPoints: MetricDataPointDTO[]): MetricSummaryDTO {
    const values = dataPoints.map((d) => d.value).filter((v): v is number => v !== null);

    if (values.length === 0) {
      return {
        average: 0,
        min: 0,
        max: 0,
        count: 0,
      };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      average: Math.round((sum / values.length) * 100) / 100,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    };
  }

  /**
   * Calculate workout summary for a period
   */
  private async calculateWorkoutSummary(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PeriodWorkoutSummaryDTO> {
    // Set end date to end of day
    const periodEnd = new Date(endDate);
    periodEnd.setHours(23, 59, 59, 999);

    // Get executions
    const executions = await this.workoutExecutionRepository.findMany({
      filter: {
        userId,
        completedDateFrom: startDate,
        completedDateTo: periodEnd,
        completed: true,
      },
    });

    // Calculate totals
    let totalDurationSeconds = 0;
    let totalDistanceMeters = 0;
    let totalVolumeKg = 0;
    let totalSets = 0;
    let totalReps = 0;

    const executionIds = executions.map((e) => e.id);

    for (const execution of executions) {
      totalDurationSeconds += execution.duration_seconds || 0;
    }

    // Get routes for distance
    if (executionIds.length > 0) {
      const routeMap = await this.workoutRouteRepository.findByExecutionIds(executionIds);
      for (const route of routeMap.values()) {
        totalDistanceMeters += Number(route.total_distance_meters) || 0;
      }
    }

    // Get set completions for strength metrics
    for (const execution of executions) {
      const sets = await this.setCompletionRepository.findMany({
        filter: { workoutExecutionId: execution.id },
      });

      for (const set of sets) {
        if (!set.skipped) {
          totalSets++;
          totalReps += set.actual_reps || 0;
          const load = set.actual_load ? Number(set.actual_load) : 0;
          const reps = set.actual_reps || 0;
          totalVolumeKg += load * reps;
        }
      }
    }

    return {
      workoutCount: executions.length,
      totalDurationSeconds,
      totalDistanceMeters: Math.round(totalDistanceMeters),
      totalVolumeKg: Math.round(totalVolumeKg),
      totalSets,
      totalReps,
    };
  }
}
