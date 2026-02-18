import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { CardioMetricType, WorkoutExecution, WorkoutType } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { MuscleGroupRepository } from 'src/repositories/muscle-group.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { UserSettingsRepository } from 'src/repositories/user-settings.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { AnalyticsPeriod, PeriodSummaryQuery, WeeklySummaryQuery } from './request.dto';
import {
  DailyActivityDTO,
  DailyWorkoutDTO,
  HRZonesSummaryDTO,
  HRZoneStatDTO,
  MetricSummaryDTO,
  MuscleGroupBreakdownDTO,
  MuscleGroupVolumeDTO,
  PeriodSummaryDTO,
  PeriodSummaryResponse,
  RouteAnalyticsDTO,
  SetSummaryDTO,
  SplitDTO,
  WeeklySummaryDTO,
  WeeklySummaryResponse,
  WorkoutAnalyticsDTO,
  WorkoutAnalyticsResponse,
  WorkoutTypeBreakdownDTO,
} from './response.dto';

@Injectable()
export class AnalyticsApiService {
  constructor(
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly setCompletionRepository: SetCompletionRepository,
    private readonly cardioMetricsRepository: CardioMetricsRepository,
    private readonly workoutRouteRepository: WorkoutRouteRepository,
    private readonly workoutScheduleRepository: WorkoutScheduleRepository,
    private readonly workoutRepository: WorkoutRepository,
    private readonly exerciseInstanceRepository: ExerciseInstanceRepository,
    private readonly exerciseRepository: ExerciseRepository,
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly muscleGroupRepository: MuscleGroupRepository,
  ) {}

  async getWeeklySummary(req: Request & { user: AuthUser }, query: WeeklySummaryQuery): Promise<WeeklySummaryResponse> {
    const referenceDate = query.date ? new Date(query.date) : new Date();

    // Get Monday of the week
    const dayOfWeek = referenceDate.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(referenceDate);
    weekStart.setDate(referenceDate.getDate() + diffToMonday);
    weekStart.setHours(0, 0, 0, 0);

    // Get Sunday of the week
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Fetch schedules for the week
    const schedules = await this.workoutScheduleRepository.findMany({
      filter: {
        userId: req.user.id,
        dateFrom: weekStart,
        dateTo: weekEnd,
      },
    });

    // Fetch workouts for type information
    const workoutIds = [...new Set(schedules.map((s) => s.workout_id))];
    const workouts = await Promise.all(workoutIds.map((id) => this.workoutRepository.findById(id)));
    const workoutMap = new Map(workouts.filter(Boolean).map((w) => [w!.id, w!]));

    // Calculate stats
    const totalScheduled = schedules.length;
    const completedSchedules = schedules.filter((s) => s.completed_at !== null);
    const totalCompleted = completedSchedules.length;
    const completionPercentage = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;

    // Fetch executions for completed schedules to get duration
    const completedScheduleIds = completedSchedules.map((s) => s.id);
    let totalDurationSeconds = 0;

    if (completedScheduleIds.length > 0) {
      // Filter by completion date, not start date
      const executions = await this.workoutExecutionRepository.findMany({
        filter: {
          userId: req.user.id,
          completedDateFrom: weekStart,
          completedDateTo: weekEnd,
          completed: true,
        },
      });

      totalDurationSeconds = executions.reduce((sum, e) => sum + (e.duration_seconds ?? 0), 0);
    }

    // Calculate type breakdown
    const typeCounts = new Map<WorkoutType, number>();
    for (const schedule of schedules) {
      const workout = workoutMap.get(schedule.workout_id);
      if (workout) {
        const currentCount = typeCounts.get(workout.type) ?? 0;
        typeCounts.set(workout.type, currentCount + 1);
      }
    }

    const typeBreakdown: WorkoutTypeBreakdownDTO[] = [];
    for (const [type, count] of typeCounts) {
      typeBreakdown.push({ type, count });
    }

    const summary: WeeklySummaryDTO = {
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      totalScheduled,
      totalCompleted,
      completionPercentage,
      totalDurationSeconds,
      typeBreakdown,
    };

    return { data: summary };
  }

  async getWorkoutAnalytics(req: Request & { user: AuthUser }, executionId: string): Promise<WorkoutAnalyticsResponse> {
    const execution = await this.workoutExecutionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Get workout info
    let workoutName = 'Unknown Workout';
    let workoutType: WorkoutType = WorkoutType.CUSTOM;

    if (execution.workout_schedule_id) {
      const schedule = await this.workoutScheduleRepository.findById(execution.workout_schedule_id);
      if (schedule) {
        const workout = await this.workoutRepository.findById(schedule.workout_id);
        if (workout) {
          workoutName = workout.name;
          workoutType = workout.type;
        }
      }
    }

    // Get metrics summary
    const metricsSummary: MetricSummaryDTO[] = [];
    const metricTypes = Object.values(CardioMetricType);

    for (const metricType of metricTypes) {
      const aggregated = await this.cardioMetricsRepository.getAggregatedMetrics(executionId, metricType);
      if (aggregated) {
        // Get unit from first metric
        const metrics = await this.cardioMetricsRepository.findMany({
          filter: { workoutExecutionId: executionId, metricType },
          limit: 1,
        });
        const unit = metrics.length > 0 ? metrics[0].unit : '';

        metricsSummary.push({
          metricType,
          min: aggregated.min,
          max: aggregated.max,
          avg: aggregated.avg,
          unit,
        });
      }
    }

    // Get set completions summary
    const setCompletions = await this.setCompletionRepository.findMany({
      filter: { workoutExecutionId: executionId },
    });

    // Group by exercise instance
    const exerciseInstanceMap = new Map<string, typeof setCompletions>();
    for (const sc of setCompletions) {
      const existing = exerciseInstanceMap.get(sc.exercise_instance_id) ?? [];
      existing.push(sc);
      exerciseInstanceMap.set(sc.exercise_instance_id, existing);
    }

    const setsSummary: SetSummaryDTO[] = [];
    for (const [instanceId, completions] of exerciseInstanceMap) {
      const instance = await this.exerciseInstanceRepository.findById(instanceId);
      if (!instance) continue;

      const exercise = await this.exerciseRepository.findById(instance.exercise_id);
      const exerciseName = exercise?.name ?? 'Unknown Exercise';

      const completedSets = completions.filter((c) => !c.skipped).length;
      const skippedSets = completions.filter((c) => c.skipped).length;

      const rpes = completions.filter((c) => c.rpe !== null).map((c) => c.rpe!);
      const avgRpe = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;

      const reps = completions.filter((c) => c.actual_reps !== null).map((c) => c.actual_reps!);
      const totalReps = reps.length > 0 ? reps.reduce((a, b) => a + b, 0) : null;

      const loads = completions.filter((c) => c.actual_load !== null).map((c) => Number.parseFloat(c.actual_load!));
      const maxLoad = loads.length > 0 ? Math.max(...loads) : null;

      setsSummary.push({
        exerciseInstanceId: instanceId,
        exerciseName,
        totalSets: instance.sets,
        completedSets,
        skippedSets,
        avgRpe,
        totalReps,
        maxLoad,
      });
    }

    // Get route analytics
    let route: RouteAnalyticsDTO | null = null;
    const workoutRoute = await this.workoutRouteRepository.findByExecutionId(executionId);

    if (workoutRoute) {
      const markers = await this.workoutRouteRepository.findMarkersByRouteId(workoutRoute.id);

      const splits: SplitDTO[] = markers.map((m) => ({
        splitNumber: m.marker_number,
        splitTimeSeconds: m.split_time_seconds,
        cumulativeTimeSeconds: m.cumulative_time_seconds,
        avgHeartRate: m.avg_heart_rate,
        avgPaceSecondsPerKm: m.avg_pace_seconds_per_km,
        elevationMeters: m.elevation_meters ? Number.parseFloat(m.elevation_meters) : null,
      }));

      route = {
        totalDistanceMeters: Number.parseFloat(workoutRoute.total_distance_meters),
        elevationGainMeters: workoutRoute.elevation_gain_meters
          ? Number.parseFloat(workoutRoute.elevation_gain_meters)
          : null,
        elevationLossMeters: workoutRoute.elevation_loss_meters
          ? Number.parseFloat(workoutRoute.elevation_loss_meters)
          : null,
        splits,
        routeGeojson: workoutRoute.route_geojson,
      };
    }

    const startedAt =
      execution.started_at instanceof Date ? execution.started_at.toISOString() : String(execution.started_at);
    const completedAt = execution.completed_at
      ? execution.completed_at instanceof Date
        ? execution.completed_at.toISOString()
        : String(execution.completed_at)
      : null;

    const analytics: WorkoutAnalyticsDTO = {
      executionId: execution.id,
      workoutName,
      workoutType,
      startedAt,
      completedAt,
      durationSeconds: execution.duration_seconds,
      metricsSummary,
      setsSummary,
      route,
    };

    return { data: analytics };
  }

  async getPeriodSummary(req: Request & { user: AuthUser }, query: PeriodSummaryQuery): Promise<PeriodSummaryResponse> {
    const { periodStart, periodEnd } = this.calculatePeriodDates(query.period);

    // Fetch executions for the period - filter by completion date, not start date
    const executions = await this.workoutExecutionRepository.findMany({
      filter: {
        userId: req.user.id,
        completedDateFrom: periodStart,
        completedDateTo: periodEnd,
        completed: true,
      },
      sort: [{ field: 'completed_at', direction: 'asc' }],
    });

    // Fetch workout types for each execution
    const workoutTypesMap = await this.getWorkoutTypesForExecutions(executions);

    // Fetch routes for distance data
    const routes = await Promise.all(executions.map((e) => this.workoutRouteRepository.findByExecutionId(e.id)));
    const routeMap = new Map(routes.filter(Boolean).map((r, i) => [executions[i].id, r!]));

    // Calculate totals
    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;
    const workoutCount = executions.length;

    for (const execution of executions) {
      totalDurationSeconds += execution.duration_seconds ?? 0;
      const route = routeMap.get(execution.id);
      if (route) {
        totalDistanceMeters += Number.parseFloat(route.total_distance_meters);
      }
    }

    // Calculate daily breakdown
    const dailyBreakdown = this.calculateDailyBreakdown(executions, workoutTypesMap, routeMap, periodStart, periodEnd);

    // Calculate HR zones summary
    const hrZonesSummary = await this.calculateHRZonesSummary(req.user.id, executions);

    // Calculate muscle group breakdown
    const muscleGroupBreakdown = await this.calculateMuscleGroupBreakdown(executions);

    const summary: PeriodSummaryDTO = {
      periodStart: periodStart.toISOString().split('T')[0],
      periodEnd: periodEnd.toISOString().split('T')[0],
      totalDistanceMeters: Math.round(totalDistanceMeters),
      workoutCount,
      totalDurationSeconds,
      dailyBreakdown,
      hrZonesSummary,
      muscleGroupBreakdown,
    };

    return { data: summary };
  }

  private calculatePeriodDates(period: AnalyticsPeriod): { periodStart: Date; periodEnd: Date } {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let periodStart: Date;
    let periodEnd: Date = now;

    switch (period) {
      case AnalyticsPeriod.SEVEN_DAYS:
        periodStart = new Date(today);
        periodStart.setDate(today.getDate() - 6);
        break;
      case AnalyticsPeriod.FOURTEEN_DAYS:
        periodStart = new Date(today);
        periodStart.setDate(today.getDate() - 13);
        break;
      case AnalyticsPeriod.THIRTY_DAYS:
        periodStart = new Date(today);
        periodStart.setDate(today.getDate() - 29);
        break;
      case AnalyticsPeriod.THIS_WEEK: {
        const dayOfWeek = today.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        periodStart = new Date(today);
        periodStart.setDate(today.getDate() + diffToMonday);
        break;
      }
      case AnalyticsPeriod.LAST_WEEK: {
        const dayOfWeek = today.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        periodEnd = new Date(today);
        periodEnd.setDate(today.getDate() + diffToMonday - 1);
        periodEnd.setHours(23, 59, 59, 999);
        periodStart = new Date(periodEnd);
        periodStart.setDate(periodEnd.getDate() - 6);
        break;
      }
      case AnalyticsPeriod.THIS_MONTH:
        periodStart = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case AnalyticsPeriod.LAST_MONTH:
        periodStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        periodEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
        break;
      case AnalyticsPeriod.YTD:
        periodStart = new Date(today.getFullYear(), 0, 1);
        break;
      default:
        periodStart = new Date(today);
        periodStart.setDate(today.getDate() - 6);
    }

    periodStart.setHours(0, 0, 0, 0);
    return { periodStart, periodEnd };
  }

  private async getWorkoutTypesForExecutions(executions: WorkoutExecution[]): Promise<Map<string, WorkoutType>> {
    const result = new Map<string, WorkoutType>();

    // Get schedule IDs and fetch schedules
    const scheduleIds = executions.filter((e) => e.workout_schedule_id).map((e) => e.workout_schedule_id!);

    const schedules = await Promise.all(
      [...new Set(scheduleIds)].map((id) => this.workoutScheduleRepository.findById(id)),
    );
    const scheduleMap = new Map(schedules.filter(Boolean).map((s) => [s!.id, s!]));

    // Get workout IDs and fetch workouts
    const workoutIds = [...new Set(schedules.filter(Boolean).map((s) => s!.workout_id))];
    const workouts = await Promise.all(workoutIds.map((id) => this.workoutRepository.findById(id)));
    const workoutMap = new Map(workouts.filter(Boolean).map((w) => [w!.id, w!]));

    // Build execution -> workout type map
    for (const execution of executions) {
      if (execution.workout_schedule_id) {
        const schedule = scheduleMap.get(execution.workout_schedule_id);
        if (schedule) {
          const workout = workoutMap.get(schedule.workout_id);
          if (workout) {
            result.set(execution.id, workout.type);
          }
        }
      }
      if (!result.has(execution.id)) {
        // Infer workout type from notes for imported/synced workouts
        result.set(execution.id, this.inferWorkoutTypeFromNotes(execution.notes));
      }
    }

    return result;
  }

  private inferWorkoutTypeFromNotes(notes: string | null): WorkoutType {
    if (!notes) return WorkoutType.CUSTOM;

    const notesLower = notes.toLowerCase();

    // Running activities
    if (
      notesLower.includes('run') ||
      notesLower.includes('jog') ||
      notesLower.includes('marathon') ||
      notesLower.includes('5k') ||
      notesLower.includes('10k')
    ) {
      return WorkoutType.RUN;
    }

    // Cycling activities
    if (
      notesLower.includes('ride') ||
      notesLower.includes('cycling') ||
      notesLower.includes('bike') ||
      notesLower.includes('biking')
    ) {
      return WorkoutType.CYCLING;
    }

    // Swimming activities
    if (notesLower.includes('swim') || notesLower.includes('pool') || notesLower.includes('lap')) {
      return WorkoutType.SWIMMING;
    }

    // Strength/gym activities
    if (
      notesLower.includes('weight') ||
      notesLower.includes('strength') ||
      notesLower.includes('gym') ||
      notesLower.includes('lift')
    ) {
      return WorkoutType.STRENGTH;
    }

    // HIIT activities
    if (notesLower.includes('hiit') || notesLower.includes('interval') || notesLower.includes('tabata')) {
      return WorkoutType.HIIT;
    }

    // Circuit activities
    if (notesLower.includes('circuit') || notesLower.includes('crossfit')) {
      return WorkoutType.CIRCUIT;
    }

    // Flexibility activities
    if (
      notesLower.includes('yoga') ||
      notesLower.includes('stretch') ||
      notesLower.includes('pilates') ||
      notesLower.includes('flexibility')
    ) {
      return WorkoutType.FLEXIBILITY;
    }

    // Cardio generic
    if (
      notesLower.includes('cardio') ||
      notesLower.includes('walk') ||
      notesLower.includes('hike') ||
      notesLower.includes('elliptical') ||
      notesLower.includes('rowing')
    ) {
      return WorkoutType.CARDIO;
    }

    return WorkoutType.CUSTOM;
  }

  private calculateDailyBreakdown(
    executions: WorkoutExecution[],
    workoutTypesMap: Map<string, WorkoutType>,
    routeMap: Map<string, { total_distance_meters: string }>,
    periodStart: Date,
    periodEnd: Date,
  ): DailyActivityDTO[] {
    // Group executions by completion date (not start date)
    const executionsByDate = new Map<string, WorkoutExecution[]>();
    for (const execution of executions) {
      // Use completed_at for grouping
      const completedAt =
        execution.completed_at instanceof Date ? execution.completed_at : new Date(String(execution.completed_at));
      const dateKey = completedAt.toISOString().split('T')[0];
      const existing = executionsByDate.get(dateKey) ?? [];
      existing.push(execution);
      executionsByDate.set(dateKey, existing);
    }

    // Generate all dates in period
    const result: DailyActivityDTO[] = [];
    const current = new Date(periodStart);

    while (current <= periodEnd) {
      const dateKey = current.toISOString().split('T')[0];
      const dayExecutions = executionsByDate.get(dateKey) ?? [];

      const workouts: DailyWorkoutDTO[] = dayExecutions.map((e) => {
        const route = routeMap.get(e.id);
        return {
          workoutType: workoutTypesMap.get(e.id) ?? WorkoutType.CUSTOM,
          durationSeconds: e.duration_seconds ?? 0,
          distanceMeters: route ? Number.parseFloat(route.total_distance_meters) : null,
        };
      });

      result.push({ date: dateKey, workouts });
      current.setDate(current.getDate() + 1);
    }

    return result;
  }

  private async calculateHRZonesSummary(
    userId: string,
    executions: WorkoutExecution[],
  ): Promise<HRZonesSummaryDTO | null> {
    // Get user settings for HR zones
    const settings = await this.userSettingsRepository.findByUserId(userId);
    if (!settings?.hr_zones) {
      return { configured: false };
    }

    const { maxHr, zones } = settings.hr_zones;
    if (!zones || zones.length === 0) {
      return { configured: false };
    }

    // Fetch all HR metrics for the executions
    const allMetrics = await Promise.all(
      executions.map((e) =>
        this.cardioMetricsRepository.findMany({
          filter: { workoutExecutionId: e.id, metricType: CardioMetricType.HEART_RATE },
          sort: [{ field: 'recorded_at', direction: 'asc' }],
        }),
      ),
    );

    // Calculate time in each zone
    const zoneTimes = new Map<number, number>();
    for (const zone of zones) {
      zoneTimes.set(zone.zone, 0);
    }

    let totalTimeSeconds = 0;

    for (const metricsArray of allMetrics) {
      for (let i = 0; i < metricsArray.length - 1; i++) {
        const current = metricsArray[i];
        const next = metricsArray[i + 1];

        const currentTime =
          current.recorded_at instanceof Date
            ? current.recorded_at.getTime()
            : new Date(String(current.recorded_at)).getTime();
        const nextTime =
          next.recorded_at instanceof Date ? next.recorded_at.getTime() : new Date(String(next.recorded_at)).getTime();

        const durationSeconds = (nextTime - currentTime) / 1000;
        if (durationSeconds > 0 && durationSeconds < 300) {
          // Max 5 minutes between samples
          const hr = Number.parseFloat(current.value);
          const hrPct = (hr / maxHr) * 100;

          for (const zone of zones) {
            if (hrPct >= zone.minPct && hrPct < zone.maxPct) {
              zoneTimes.set(zone.zone, (zoneTimes.get(zone.zone) ?? 0) + durationSeconds);
              totalTimeSeconds += durationSeconds;
              break;
            }
          }
        }
      }
    }

    if (totalTimeSeconds === 0) {
      return { configured: true, zones: [] };
    }

    const zoneStats: HRZoneStatDTO[] = zones.map((zone) => ({
      zone: zone.zone,
      name: zone.name,
      minBpm: Math.round((zone.minPct / 100) * maxHr),
      maxBpm: Math.round((zone.maxPct / 100) * maxHr),
      timeSeconds: Math.round(zoneTimes.get(zone.zone) ?? 0),
      percentage: Math.round(((zoneTimes.get(zone.zone) ?? 0) / totalTimeSeconds) * 100),
    }));

    return { configured: true, zones: zoneStats };
  }

  private async calculateMuscleGroupBreakdown(executions: WorkoutExecution[]): Promise<MuscleGroupBreakdownDTO | null> {
    if (executions.length === 0) {
      return null;
    }

    // Fetch all set completions for the executions
    const allSetCompletions = await Promise.all(
      executions.map((e) =>
        this.setCompletionRepository.findMany({
          filter: { workoutExecutionId: e.id },
        }),
      ),
    );

    const flattenedCompletions = allSetCompletions.flat();
    if (flattenedCompletions.length === 0) {
      return null;
    }

    // Get unique exercise instance IDs
    const exerciseInstanceIds = [...new Set(flattenedCompletions.map((c) => c.exercise_instance_id))];

    // Fetch exercise instances and their exercises
    const exerciseInstances = await Promise.all(
      exerciseInstanceIds.map((id) => this.exerciseInstanceRepository.findById(id)),
    );
    const instanceMap = new Map(exerciseInstances.filter(Boolean).map((ei) => [ei!.id, ei!]));

    // Fetch exercises and their muscle groups
    const exerciseIds = [...new Set(exerciseInstances.filter(Boolean).map((ei) => ei!.exercise_id))];
    const exerciseMuscleGroups = await Promise.all(
      exerciseIds.map(async (exId) => {
        const muscleGroups = await this.muscleGroupRepository.findByExerciseId(exId);
        return { exerciseId: exId, muscleGroups };
      }),
    );
    const exerciseMuscleMap = new Map(exerciseMuscleGroups.map((emg) => [emg.exerciseId, emg.muscleGroups]));

    // Aggregate volume by muscle group
    interface MuscleStats {
      sets: number;
      reps: number;
      volume: number;
      isPrimary: boolean;
      name: string;
    }
    const muscleGroupStats = new Map<string, MuscleStats>();

    let totalSets = 0;
    let totalReps = 0;
    let totalVolume = 0;

    for (const completion of flattenedCompletions) {
      if (completion.skipped) continue;

      const instance = instanceMap.get(completion.exercise_instance_id);
      if (!instance) continue;

      const muscleGroups = exerciseMuscleMap.get(instance.exercise_id) || [];
      if (muscleGroups.length === 0) continue;

      const reps = completion.actual_reps ?? 0;
      const load = completion.actual_load ? Number.parseFloat(completion.actual_load) : 1;
      const setVolume = reps * load;

      totalSets += 1;
      totalReps += reps;
      totalVolume += setVolume;

      // Distribute volume to muscle groups (primary gets full volume, secondary gets 50%)
      for (const mg of muscleGroups) {
        const existing = muscleGroupStats.get(mg.id) || {
          sets: 0,
          reps: 0,
          volume: 0,
          isPrimary: mg.is_primary,
          name: mg.name,
        };

        const volumeMultiplier = mg.is_primary ? 1 : 0.5;
        existing.sets += 1;
        existing.reps += reps;
        existing.volume += setVolume * volumeMultiplier;

        // Keep as primary if it was ever primary
        if (mg.is_primary) {
          existing.isPrimary = true;
        }

        muscleGroupStats.set(mg.id, existing);
      }
    }

    if (muscleGroupStats.size === 0) {
      return null;
    }

    // Calculate total weighted volume for percentage calculation
    const totalWeightedVolume = Array.from(muscleGroupStats.values()).reduce((sum, stats) => sum + stats.volume, 0);

    // Convert to DTOs and sort by volume
    const muscleGroups: MuscleGroupVolumeDTO[] = Array.from(muscleGroupStats.entries())
      .map(([id, stats]) => ({
        muscleGroupId: id,
        muscleGroupName: stats.name,
        isPrimary: stats.isPrimary,
        totalSets: stats.sets,
        totalReps: stats.reps,
        totalVolume: Math.round(stats.volume),
        volumePercentage: totalWeightedVolume > 0 ? Math.round((stats.volume / totalWeightedVolume) * 100) : 0,
      }))
      .sort((a, b) => b.totalVolume - a.totalVolume);

    return {
      muscleGroups,
      totalVolume: Math.round(totalVolume),
      totalSets,
      totalReps,
    };
  }
}
