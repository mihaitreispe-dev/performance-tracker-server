import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { CardioMetricType, CoachAthleteStatus, ExecutionWeather, WorkoutExecution, WorkoutType } from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { DailyTrainingLoadRepository } from 'src/repositories/daily-training-load.repository';
import { ExecutionWeatherRepository } from 'src/repositories/execution-weather.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { MuscleGroupRepository } from 'src/repositories/muscle-group.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { UserSettingsRepository } from 'src/repositories/user-settings.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import {
  AnalyticsPeriod,
  PeriodSummaryQuery,
  StrengthProgressionQuery,
  TrainingLoadHistoryQuery,
  WeeklySummaryQuery,
} from './request.dto';
import {
  CurrentTrainingLoadDTO,
  CurrentTrainingLoadResponse,
  DailyActivityDTO,
  DailyWorkoutDTO,
  ExecutionWeatherDTO,
  HRZonesSummaryDTO,
  HRZoneStatDTO,
  MetricSummaryDTO,
  MuscleGroupBreakdownDTO,
  MuscleGroupVolumeDTO,
  PeriodSummaryDTO,
  PeriodSummaryResponse,
  RaceDataSourceDTO,
  RacePredictionDTO,
  RacePredictionsDTO,
  RacePredictionsResponse,
  RouteAnalyticsDTO,
  SetSummaryDTO,
  SplitDTO,
  StreakDayDTO,
  StreakDTO,
  StreakResponse,
  StreakWeekDTO,
  StrengthDataPointDTO,
  StrengthProgressionDTO,
  StrengthProgressionResponse,
  TrackedExerciseDTO,
  TrackedExercisesDTO,
  TrackedExercisesResponse,
  TrainingLoadDTO,
  TrainingLoadHistoryDTO,
  TrainingLoadHistoryResponse,
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
    private readonly dailyTrainingLoadRepository: DailyTrainingLoadRepository,
    private readonly personalRecordRepository: PersonalRecordRepository,
    private readonly executionWeatherRepository: ExecutionWeatherRepository,
    private readonly relationshipRepository: CoachAthleteRelationshipRepository,
    private readonly privacySettingsRepository: AthletePrivacySettingsRepository,
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

    // Fetch workouts for type information - batch fetch instead of N+1 queries
    const workoutIds = [...new Set(schedules.map((s) => s.workout_id))];
    const workouts = await this.workoutRepository.findByIds(workoutIds);
    const workoutMap = new Map(workouts.map((w) => [w.id, w]));

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

    // Check if user owns the execution or is a coach with access
    if (execution.user_id !== req.user.id) {
      // Check if user is a coach with active relationship and athlete has shared analytics
      const relationship = await this.relationshipRepository.findActiveByCoachAndAthlete(
        req.user.id,
        execution.user_id,
      );

      if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
        throw new ForbiddenException('Access denied');
      }

      const settings = await this.privacySettingsRepository.findByUserId(execution.user_id);
      if (!settings?.share_analytics) {
        throw new ForbiddenException('Athlete has not shared analytics with you');
      }
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

    // Batch fetch exercise instances and exercises
    const instanceIds = [...exerciseInstanceMap.keys()];
    const instances = await this.exerciseInstanceRepository.findByIds(instanceIds);
    const instanceLookup = new Map(instances.map((i) => [i.id, i]));

    const exerciseIds = [...new Set(instances.map((i) => i.exercise_id))];
    const exercises = await this.exerciseRepository.findByIds(exerciseIds);
    const exerciseLookup = new Map(exercises.map((e) => [e.id, e]));

    const setsSummary: SetSummaryDTO[] = [];
    for (const [instanceId, completions] of exerciseInstanceMap) {
      const instance = instanceLookup.get(instanceId);
      if (!instance) continue;

      const exercise = exerciseLookup.get(instance.exercise_id);
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

    // Get weather data if available
    const weatherData = await this.executionWeatherRepository.findByExecutionId(executionId);
    const weather = weatherData ? this.mapWeatherToDTO(weatherData) : null;

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
      weather,
    };

    return { data: analytics };
  }

  private mapWeatherToDTO(weather: ExecutionWeather): ExecutionWeatherDTO {
    const recordedAt =
      weather.recorded_at instanceof Date ? weather.recorded_at.toISOString() : String(weather.recorded_at);

    return {
      temperatureCelsius: weather.temperature_celsius ? Number.parseFloat(weather.temperature_celsius) : null,
      feelsLikeCelsius: weather.feels_like_celsius ? Number.parseFloat(weather.feels_like_celsius) : null,
      humidityPercent: weather.humidity_percent,
      windSpeedKmh: weather.wind_speed_kmh ? Number.parseFloat(weather.wind_speed_kmh) : null,
      windDirectionDegrees: weather.wind_direction_degrees,
      windGustsKmh: weather.wind_gusts_kmh ? Number.parseFloat(weather.wind_gusts_kmh) : null,
      precipitationMm: weather.precipitation_mm ? Number.parseFloat(weather.precipitation_mm) : null,
      weatherCode: weather.weather_code,
      weatherDescription: weather.weather_description,
      cloudCoverPercent: weather.cloud_cover_percent,
      pressureHpa: weather.pressure_hpa ? Number.parseFloat(weather.pressure_hpa) : null,
      visibilityMeters: weather.visibility_meters,
      uvIndex: weather.uv_index ? Number.parseFloat(weather.uv_index) : null,
      recordedAt,
    };
  }

  async getPeriodSummary(req: Request & { user: AuthUser }, query: PeriodSummaryQuery): Promise<PeriodSummaryResponse> {
    // Use custom date range if provided, otherwise use period-based calculation
    let periodStart: Date;
    let periodEnd: Date;

    if (query.dateFrom && query.dateTo) {
      periodStart = new Date(query.dateFrom);
      periodEnd = new Date(query.dateTo);
      // Set periodEnd to end of day
      periodEnd.setHours(23, 59, 59, 999);
    } else if (query.period) {
      const dates = this.calculatePeriodDates(query.period);
      periodStart = dates.periodStart;
      periodEnd = dates.periodEnd;
    } else {
      // Default to last 7 days
      const dates = this.calculatePeriodDates('7d');
      periodStart = dates.periodStart;
      periodEnd = dates.periodEnd;
    }

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

    // Fetch routes for distance data - batch fetch instead of N+1 queries
    const executionIds = executions.map((e) => e.id);
    const routeMap = await this.workoutRouteRepository.findByExecutionIds(executionIds);

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

    // Get schedule IDs and batch fetch schedules
    const scheduleIds = [...new Set(executions.filter((e) => e.workout_schedule_id).map((e) => e.workout_schedule_id!))];
    const schedules = await this.workoutScheduleRepository.findByIds(scheduleIds);
    const scheduleMap = new Map(schedules.map((s) => [s.id, s]));

    // Get workout IDs and batch fetch workouts
    const workoutIds = [...new Set(schedules.map((s) => s.workout_id))];
    const workouts = await this.workoutRepository.findByIds(workoutIds);
    const workoutMap = new Map(workouts.map((w) => [w.id, w]));

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

    // Fetch all HR metrics for the executions - batch fetch instead of N+1 queries
    const executionIds = executions.map((e) => e.id);
    const allMetricsMap = await this.cardioMetricsRepository.findByExecutionIds(executionIds, CardioMetricType.HEART_RATE);
    const allMetrics = executions.map((e) => allMetricsMap.get(e.id) || []);

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

    // Get unique exercise instance IDs and batch fetch
    const exerciseInstanceIds = [...new Set(flattenedCompletions.map((c) => c.exercise_instance_id))];
    const exerciseInstances = await this.exerciseInstanceRepository.findByIds(exerciseInstanceIds);
    const instanceMap = new Map(exerciseInstances.map((ei) => [ei.id, ei]));

    // Batch fetch exercises and their muscle groups
    const exerciseIds = [...new Set(exerciseInstances.map((ei) => ei.exercise_id))];
    const exerciseMuscleMap = await this.muscleGroupRepository.findByExerciseIds(exerciseIds);

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

  // ==================== Training Load Methods ====================

  async getCurrentTrainingLoad(req: Request & { user: AuthUser }): Promise<CurrentTrainingLoadResponse> {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // Calculate and store training load for recent days if needed
    await this.updateTrainingLoadHistory(req.user.id, 35); // 28 days + buffer

    // Get the 7-day (acute) and 28-day (chronic) loads
    const acutePeriodStart = new Date(today);
    acutePeriodStart.setDate(today.getDate() - 6);
    acutePeriodStart.setHours(0, 0, 0, 0);

    const chronicPeriodStart = new Date(today);
    chronicPeriodStart.setDate(today.getDate() - 27);
    chronicPeriodStart.setHours(0, 0, 0, 0);

    const recentLoads = await this.dailyTrainingLoadRepository.findMany({
      filter: {
        userId: req.user.id,
        dateFrom: chronicPeriodStart,
        dateTo: today,
      },
      sort: [{ field: 'date', direction: 'desc' }],
    });

    // Calculate exponentially weighted averages
    const { acuteLoad, chronicLoad, workoutsLast7Days, workoutsLast28Days } = this.calculateWeightedLoads(
      recentLoads,
      today,
    );

    // Need minimum data for meaningful metrics
    // At least 3 workouts in 28 days and some chronic load buildup
    const hasEnoughData = workoutsLast28Days >= 3 && chronicLoad > 0;

    // Calculate ACWR
    let acwr: number | null = null;
    let acwrStatus: 'optimal' | 'caution' | 'high_risk' | 'low' | 'no_data' = 'no_data';

    if (hasEnoughData) {
      acwr = Math.round((acuteLoad / chronicLoad) * 100) / 100;

      if (acwr >= 0.8 && acwr <= 1.3) {
        acwrStatus = 'optimal';
      } else if (acwr > 1.3 && acwr <= 1.5) {
        acwrStatus = 'caution';
      } else if (acwr > 1.5) {
        acwrStatus = 'high_risk';
      } else {
        acwrStatus = 'low';
      }
    }

    // Calculate form scores using PMC (Performance Management Chart) model
    // Fitness = CTL (Chronic Training Load)
    // Fatigue = ATL (Acute Training Load)
    // Form = TSB (Training Stress Balance) = CTL - ATL (as percentage of chronic)
    const fitnessScore = Math.round(chronicLoad * 10) / 10;
    const fatigueScore = Math.round(acuteLoad * 10) / 10;
    // Use relative form score (percentage-based) for better scaling
    const formScore =
      chronicLoad > 0
        ? Math.round(((chronicLoad - acuteLoad) / chronicLoad) * 100) / 10 // -10 to +10 range typically
        : 0;

    // Form status based on ACWR (more reliable than absolute form score)
    let formStatus: 'fresh' | 'neutral' | 'fatigued' | 'no_data' = 'no_data';
    if (hasEnoughData && acwr !== null) {
      if (acwr < 0.8) {
        // Low training load relative to fitness - well rested
        formStatus = 'fresh';
      } else if (acwr <= 1.3) {
        // Optimal zone - balanced
        formStatus = 'neutral';
      } else if (acwr <= 1.5) {
        // Elevated but manageable
        formStatus = 'neutral';
      } else {
        // High acute load relative to fitness - fatigued
        formStatus = 'fatigued';
      }
    } else if (workoutsLast28Days > 0 && workoutsLast28Days < 3) {
      // Building baseline - show as neutral rather than no_data
      formStatus = 'neutral';
      acwrStatus = 'optimal'; // Don't alarm new users
    }

    const data: CurrentTrainingLoadDTO = {
      date: today.toISOString().split('T')[0],
      acuteLoad: Math.round(acuteLoad * 10) / 10,
      chronicLoad: Math.round(chronicLoad * 10) / 10,
      acwr,
      acwrStatus,
      fatigueScore,
      fitnessScore,
      formScore,
      formStatus,
      workoutsLast7Days,
      workoutsLast28Days,
    };

    return { data };
  }

  async getTrainingLoadHistory(
    req: Request & { user: AuthUser },
    query: TrainingLoadHistoryQuery,
  ): Promise<TrainingLoadHistoryResponse> {
    const days = query.days || 90;
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const periodStart = new Date(today);
    periodStart.setDate(today.getDate() - days + 1);
    periodStart.setHours(0, 0, 0, 0);

    // Update training load history
    await this.updateTrainingLoadHistory(req.user.id, days + 28);

    // Fetch stored data
    const loads = await this.dailyTrainingLoadRepository.findMany({
      filter: {
        userId: req.user.id,
        dateFrom: periodStart,
        dateTo: today,
      },
      sort: [{ field: 'date', direction: 'asc' }],
    });

    const history: TrainingLoadDTO[] = loads.map((load) => ({
      date: load.date instanceof Date ? formatDateToYMD(load.date) : String(load.date).split('T')[0],
      dailyLoad: Number.parseFloat(load.daily_load),
      acuteLoad: Number.parseFloat(load.acute_load),
      chronicLoad: Number.parseFloat(load.chronic_load),
      acwr: load.acwr ? Number.parseFloat(load.acwr) : null,
      fatigueScore: load.fatigue_score ? Number.parseFloat(load.fatigue_score) : null,
      fitnessScore: load.fitness_score ? Number.parseFloat(load.fitness_score) : null,
      formScore: load.form_score ? Number.parseFloat(load.form_score) : null,
      hrLoadContribution: load.hr_load_contribution ? Number.parseFloat(load.hr_load_contribution) : 0,
      durationLoadContribution: load.duration_load_contribution
        ? Number.parseFloat(load.duration_load_contribution)
        : 0,
      volumeLoadContribution: load.volume_load_contribution ? Number.parseFloat(load.volume_load_contribution) : 0,
      workoutCount: load.workout_count,
    }));

    const data: TrainingLoadHistoryDTO = { history };
    return { data };
  }

  private async updateTrainingLoadHistory(userId: string, daysBack: number): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - daysBack + 1);

    // Get existing data dates
    const existingDates = new Set(await this.dailyTrainingLoadRepository.getDaysWithData(userId, startDate, today));

    // Get user settings for HR zones
    const settings = await this.userSettingsRepository.findByUserId(userId);
    const hrZones = settings?.hr_zones;

    // Fetch all executions in the period
    const executions = await this.workoutExecutionRepository.findMany({
      filter: {
        userId,
        completedDateFrom: startDate,
        completedDateTo: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
        completed: true,
      },
      sort: [{ field: 'completed_at', direction: 'asc' }],
    });

    // Group executions by date
    const executionsByDate = new Map<string, WorkoutExecution[]>();
    for (const execution of executions) {
      const completedAt =
        execution.completed_at instanceof Date ? execution.completed_at : new Date(String(execution.completed_at));
      const dateKey = formatDateToYMD(completedAt);
      const existing = executionsByDate.get(dateKey) ?? [];
      existing.push(execution);
      executionsByDate.set(dateKey, existing);
    }

    // Process each day and cache load contributions
    const current = new Date(startDate);
    const allDailyLoads: Array<{ date: string; dailyLoad: number }> = [];
    const loadContributionsCache = new Map<string, { hrLoad: number; durationLoad: number; volumeLoad: number }>();

    while (current <= today) {
      const dateKey = current.toISOString().split('T')[0];
      const dayExecutions = executionsByDate.get(dateKey) ?? [];

      // Calculate daily load for this day and cache the result
      const loadContributions = await this.calculateDailyLoad(dayExecutions, hrZones);
      loadContributionsCache.set(dateKey, loadContributions);
      const dailyLoad = loadContributions.hrLoad + loadContributions.durationLoad + loadContributions.volumeLoad;

      allDailyLoads.push({ date: dateKey, dailyLoad });
      current.setDate(current.getDate() + 1);
    }

    // Calculate rolling averages and save
    for (let i = 0; i < allDailyLoads.length; i++) {
      const { date, dailyLoad } = allDailyLoads[i];
      const dayExecutions = executionsByDate.get(date) ?? [];

      // Calculate acute load (7-day exponentially weighted)
      let acuteLoad = 0;
      let acuteWeight = 0;
      for (let j = Math.max(0, i - 6); j <= i; j++) {
        const daysAgo = i - j;
        const weight = Math.exp(-daysAgo / 7);
        acuteLoad += allDailyLoads[j].dailyLoad * weight;
        acuteWeight += weight;
      }
      acuteLoad = acuteWeight > 0 ? acuteLoad / acuteWeight : 0;

      // Calculate chronic load (28-day exponentially weighted)
      let chronicLoad = 0;
      let chronicWeight = 0;
      for (let j = Math.max(0, i - 27); j <= i; j++) {
        const daysAgo = i - j;
        const weight = Math.exp(-daysAgo / 28);
        chronicLoad += allDailyLoads[j].dailyLoad * weight;
        chronicWeight += weight;
      }
      chronicLoad = chronicWeight > 0 ? chronicLoad / chronicWeight : 0;

      // Calculate ACWR
      const acwr = chronicLoad > 0 ? acuteLoad / chronicLoad : null;

      // Calculate PMC scores
      const fitnessScore = chronicLoad;
      const fatigueScore = acuteLoad;
      // Use relative form score (percentage-based) for better scaling
      const formScore =
        chronicLoad > 0
          ? ((chronicLoad - acuteLoad) / chronicLoad) * 10 // -10 to +10 range typically
          : 0;

      // Get load contributions from cache (already calculated in first pass)
      const { hrLoad, durationLoad, volumeLoad } = loadContributionsCache.get(date) ?? {
        hrLoad: 0,
        durationLoad: 0,
        volumeLoad: 0,
      };

      // Only update if data doesn't exist or if it's a recent day (last 7 days need refresh)
      const dateObj = new Date(date);
      const daysFromToday = Math.floor((today.getTime() - dateObj.getTime()) / (24 * 60 * 60 * 1000));
      const needsUpdate = !existingDates.has(date) || daysFromToday <= 7;

      if (needsUpdate) {
        await this.dailyTrainingLoadRepository.upsert({
          user_id: userId,
          date: new Date(date),
          daily_load: dailyLoad,
          acute_load: acuteLoad,
          chronic_load: chronicLoad,
          acwr,
          fatigue_score: fatigueScore,
          fitness_score: fitnessScore,
          form_score: formScore,
          hr_load_contribution: hrLoad,
          duration_load_contribution: durationLoad,
          volume_load_contribution: volumeLoad,
          workout_count: dayExecutions.length,
        });
      }
    }
  }

  private async calculateDailyLoad(
    executions: WorkoutExecution[],
    hrZones?: { maxHr: number; zones: Array<{ zone: number; minPct: number; maxPct: number }> } | null,
  ): Promise<{ hrLoad: number; durationLoad: number; volumeLoad: number }> {
    let hrLoad = 0;
    let durationLoad = 0;
    let volumeLoad = 0;

    for (const execution of executions) {
      const durationMinutes = (execution.duration_seconds ?? 0) / 60;

      // HR-based load (TRIMP-like)
      if (hrZones) {
        const hrMetrics = await this.cardioMetricsRepository.findMany({
          filter: { workoutExecutionId: execution.id, metricType: CardioMetricType.HEART_RATE },
          sort: [{ field: 'recorded_at', direction: 'asc' }],
        });

        if (hrMetrics.length > 1) {
          for (let i = 0; i < hrMetrics.length - 1; i++) {
            const current = hrMetrics[i];
            const next = hrMetrics[i + 1];

            const currentTime =
              current.recorded_at instanceof Date
                ? current.recorded_at.getTime()
                : new Date(String(current.recorded_at)).getTime();
            const nextTime =
              next.recorded_at instanceof Date
                ? next.recorded_at.getTime()
                : new Date(String(next.recorded_at)).getTime();

            const segmentMinutes = (nextTime - currentTime) / 1000 / 60;
            if (segmentMinutes > 0 && segmentMinutes < 5) {
              const hr = Number.parseFloat(current.value);
              const hrPct = (hr / hrZones.maxHr) * 100;

              // Zone factor: higher zones = higher load
              let zoneFactor = 1;
              for (const zone of hrZones.zones) {
                if (hrPct >= zone.minPct && hrPct < zone.maxPct) {
                  zoneFactor = zone.zone;
                  break;
                }
              }

              hrLoad += segmentMinutes * zoneFactor;
            }
          }
        }
      }

      // Duration-based load (for workouts without HR data or as baseline)
      if (hrLoad === 0 && durationMinutes > 0) {
        // Use duration with a base intensity factor
        durationLoad += durationMinutes * 1.5; // Base factor for unknown intensity
      }

      // Volume-based load from strength training
      // Use a formula that scales reasonably with cardio:
      // - A typical strength workout (20 sets, moderate weight) should equal ~30-60 min cardio
      // - Use sqrt scaling to prevent huge weights from dominating
      const setCompletions = await this.setCompletionRepository.findMany({
        filter: { workoutExecutionId: execution.id },
      });

      for (const set of setCompletions) {
        if (!set.skipped && set.actual_reps) {
          const reps = set.actual_reps;
          const load = set.actual_load ? Number.parseFloat(set.actual_load) : 0;
          const rpe = set.rpe ?? 6; // Default RPE if not provided

          if (load > 0) {
            // Weighted set: sqrt(reps * load) provides reasonable scaling
            // 10 reps × 100kg = sqrt(1000) ≈ 31.6, × RPE factor (0.6-1.0) ≈ 19-32 per set
            // 20 sets ≈ 380-640 total, comparable to 30-60 min zone 2-3 cardio
            volumeLoad += Math.sqrt(reps * load) * (rpe / 10);
          } else {
            // Bodyweight set: just use reps with RPE
            // 15 reps bodyweight at RPE 7 = 15 * 0.7 = 10.5 per set
            volumeLoad += reps * (rpe / 10) * 0.5;
          }
        }
      }
    }

    return { hrLoad, durationLoad, volumeLoad };
  }

  private calculateWeightedLoads(
    recentLoads: Array<{ date: Date; daily_load: string; workout_count: number }>,
    referenceDate: Date,
  ): { acuteLoad: number; chronicLoad: number; workoutsLast7Days: number; workoutsLast28Days: number } {
    let acuteLoad = 0;
    let acuteWeight = 0;
    let chronicLoad = 0;
    let chronicWeight = 0;
    let workoutsLast7Days = 0;
    let workoutsLast28Days = 0;

    for (const load of recentLoads) {
      const loadDate = load.date instanceof Date ? load.date : new Date(String(load.date));
      const daysAgo = Math.floor((referenceDate.getTime() - loadDate.getTime()) / (24 * 60 * 60 * 1000));
      const dailyLoad = Number.parseFloat(load.daily_load);

      if (daysAgo <= 6) {
        const weight = Math.exp(-daysAgo / 7);
        acuteLoad += dailyLoad * weight;
        acuteWeight += weight;
        workoutsLast7Days += load.workout_count;
      }

      if (daysAgo <= 27) {
        const weight = Math.exp(-daysAgo / 28);
        chronicLoad += dailyLoad * weight;
        chronicWeight += weight;
        workoutsLast28Days += load.workout_count;
      }
    }

    return {
      acuteLoad: acuteWeight > 0 ? acuteLoad / acuteWeight : 0,
      chronicLoad: chronicWeight > 0 ? chronicLoad / chronicWeight : 0,
      workoutsLast7Days,
      workoutsLast28Days,
    };
  }

  // ==================== Streak Methods ====================

  async getStreak(req: Request & { user: AuthUser }): Promise<StreakResponse> {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // Get Monday of current week
    const dayOfWeek = today.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() + diffToMonday);
    currentWeekStart.setHours(0, 0, 0, 0);

    // Go back far enough to calculate longest streak (1 year)
    const lookbackStart = new Date(currentWeekStart);
    lookbackStart.setDate(lookbackStart.getDate() - 365);

    // Fetch all completed executions
    const executions = await this.workoutExecutionRepository.findMany({
      filter: {
        userId: req.user.id,
        completedDateFrom: lookbackStart,
        completedDateTo: today,
        completed: true,
      },
      sort: [{ field: 'completed_at', direction: 'asc' }],
    });

    // Get workout types for each execution
    const workoutTypesMap = await this.getWorkoutTypesForExecutions(executions);

    // Group executions by week (Monday-based)
    const executionsByWeek = new Map<string, WorkoutExecution[]>();
    const executionsByDate = new Map<string, { execution: WorkoutExecution; type: WorkoutType }[]>();

    for (const execution of executions) {
      const completedAt =
        execution.completed_at instanceof Date ? execution.completed_at : new Date(String(execution.completed_at));
      const dateKey = formatDateToYMD(completedAt);

      // Group by date
      const dateList = executionsByDate.get(dateKey) ?? [];
      dateList.push({
        execution,
        type: workoutTypesMap.get(execution.id) ?? WorkoutType.CUSTOM,
      });
      executionsByDate.set(dateKey, dateList);

      // Get week start for this execution
      const execDayOfWeek = completedAt.getDay();
      const execDiffToMonday = execDayOfWeek === 0 ? -6 : 1 - execDayOfWeek;
      const weekStart = new Date(completedAt);
      weekStart.setDate(completedAt.getDate() + execDiffToMonday);
      const weekKey = formatDateToYMD(weekStart);

      const weekList = executionsByWeek.get(weekKey) ?? [];
      weekList.push(execution);
      executionsByWeek.set(weekKey, weekList);
    }

    // Calculate streaks - a week counts if it has 3+ workouts
    const weekStartDates: string[] = [];
    const current = new Date(lookbackStart);
    while (current <= currentWeekStart) {
      weekStartDates.push(formatDateToYMD(current));
      current.setDate(current.getDate() + 7);
    }

    // Calculate current streak and longest streak
    let currentStreakWeeks = 0;
    let longestStreakWeeks = 0;
    let tempStreak = 0;

    // Process weeks from oldest to newest
    for (const weekKey of weekStartDates) {
      const weekExecutions = executionsByWeek.get(weekKey) ?? [];
      const countsTowardStreak = weekExecutions.length >= 3;

      if (countsTowardStreak) {
        tempStreak++;
        if (tempStreak > longestStreakWeeks) {
          longestStreakWeeks = tempStreak;
        }
      } else {
        tempStreak = 0;
      }
    }

    // Current streak: count backwards from current week
    // Current week might still be in progress, so we start from last complete week
    const lastWeekStart = new Date(currentWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    for (let i = weekStartDates.length - 2; i >= 0; i--) {
      const weekKey = weekStartDates[i];
      const weekExecutions = executionsByWeek.get(weekKey) ?? [];
      if (weekExecutions.length >= 3) {
        currentStreakWeeks++;
      } else {
        break;
      }
    }

    // Check if current week is on track
    const currentWeekKey = formatDateToYMD(currentWeekStart);
    const currentWeekExecutions = executionsByWeek.get(currentWeekKey) ?? [];
    const currentWeekWorkouts = currentWeekExecutions.length;

    // Days remaining in current week
    const todayDayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
    const daysRemaining = 7 - todayDayOfWeek;

    // Current week on track if already has 3+ or can still reach 3
    const currentWeekOnTrack = currentWeekWorkouts >= 3 || currentWeekWorkouts + daysRemaining >= 3;
    const workoutsNeededThisWeek = Math.max(0, 3 - currentWeekWorkouts);

    // If current week already qualifies, add it to current streak
    if (currentWeekWorkouts >= 3) {
      currentStreakWeeks++;
    }

    // Build last 4 weeks breakdown
    const weeks: StreakWeekDTO[] = [];

    for (let weekOffset = 0; weekOffset < 4; weekOffset++) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(weekStart.getDate() - weekOffset * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weekKey = formatDateToYMD(weekStart);
      const weekExecutions = executionsByWeek.get(weekKey) ?? [];

      const days: StreakDayDTO[] = [];

      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(dayDate.getDate() + dayOffset);
        const dateKey = formatDateToYMD(dayDate);

        const dayExecutions = executionsByDate.get(dateKey) ?? [];
        const hasWorkout = dayExecutions.length > 0;
        const workoutType = hasWorkout ? dayExecutions[0].type : null;

        const isPast = dayDate < today && dayDate.toDateString() !== today.toDateString();
        const isToday = dayDate.toDateString() === today.toDateString();

        days.push({
          date: dateKey,
          dayOfWeek: dayOffset + 1, // 1 = Monday
          hasWorkout,
          workoutType,
          isPast,
          isToday,
        });
      }

      weeks.push({
        weekNumber: weekOffset,
        weekStart: weekKey,
        weekEnd: formatDateToYMD(weekEnd),
        workoutCount: weekExecutions.length,
        countsTowardStreak: weekExecutions.length >= 3,
        days,
      });
    }

    const data: StreakDTO = {
      currentStreakWeeks,
      longestStreakWeeks,
      totalWorkouts: executions.length,
      currentWeekOnTrack,
      workoutsNeededThisWeek,
      weeks,
    };

    return { data };
  }

  // ==================== Race Predictions Methods ====================

  // Race distances in meters
  private readonly RACE_DISTANCES = [
    { id: '5k', name: '5K', meters: 5000 },
    { id: '10k', name: '10K', meters: 10000 },
    { id: 'half_marathon', name: 'Half Marathon', meters: 21097.5 },
    { id: 'marathon', name: 'Marathon', meters: 42195 },
  ];

  async getRacePredictions(req: Request & { user: AuthUser }): Promise<RacePredictionsResponse> {
    // Try to find the best data source for predictions
    const dataSource = await this.findBestRaceDataSource(req.user.id);

    if (!dataSource) {
      const data: RacePredictionsDTO = {
        predictions: [],
        dataSource: {
          sourceType: 'recent_run',
          distanceMeters: 0,
          timeSeconds: 0,
          achievedAt: new Date().toISOString(),
          description: null,
        },
        hasData: false,
        message:
          'No running data available. Complete a run with GPS tracking or achieve a running PR to see predictions.',
      };
      return { data };
    }

    // Calculate predictions using Riegel's formula: T2 = T1 × (D2/D1)^1.06
    const predictions: RacePredictionDTO[] = this.RACE_DISTANCES.map((race) => {
      const predictedTimeSeconds = this.predictRaceTime(dataSource.distanceMeters, dataSource.timeSeconds, race.meters);

      const paceSecondsPerKm = predictedTimeSeconds / (race.meters / 1000);

      // Calculate confidence based on how close the source distance is to the target
      const distanceRatio =
        Math.min(dataSource.distanceMeters, race.meters) / Math.max(dataSource.distanceMeters, race.meters);
      const confidence = Math.round(distanceRatio * 100);

      return {
        raceId: race.id,
        raceName: race.name,
        distanceMeters: race.meters,
        predictedTimeSeconds: Math.round(predictedTimeSeconds),
        predictedTimeFormatted: this.formatRaceTime(predictedTimeSeconds),
        paceSecondsPerKm: Math.round(paceSecondsPerKm),
        paceFormatted: this.formatPace(paceSecondsPerKm),
        confidence,
      };
    });

    const data: RacePredictionsDTO = {
      predictions,
      dataSource,
      hasData: true,
      message: null,
    };

    return { data };
  }

  private async findBestRaceDataSource(userId: string): Promise<RaceDataSourceDTO | null> {
    // Priority 1: Use existing running PRs (fastest times for known distances)
    const prRecordTypes = [
      { type: 'fastest_5k', distance: 5000, name: '5K PR' },
      { type: 'fastest_10k', distance: 10000, name: '10K PR' },
      { type: 'fastest_half_marathon', distance: 21097.5, name: 'Half Marathon PR' },
      { type: 'fastest_marathon', distance: 42195, name: 'Marathon PR' },
      { type: 'fastest_1k', distance: 1000, name: '1K PR' },
    ];

    const prs = await this.personalRecordRepository.findMany({
      userId,
      category: 'cardio_distance',
    });

    // Find the best PR to use (prefer longer distances as they're more reliable)
    for (const prDef of prRecordTypes) {
      const pr = prs.find((p) => p.record_type === prDef.type);
      if (pr) {
        const achievedAt = pr.achieved_at instanceof Date ? pr.achieved_at.toISOString() : String(pr.achieved_at);

        return {
          sourceType: 'personal_record',
          distanceMeters: prDef.distance,
          timeSeconds: Number.parseFloat(pr.value),
          achievedAt,
          description: prDef.name,
        };
      }
    }

    // Priority 2: Use recent runs with route data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentExecutions = await this.workoutExecutionRepository.findMany({
      filter: {
        userId,
        completedDateFrom: thirtyDaysAgo,
        completedDateTo: new Date(),
        completed: true,
      },
      sort: [{ field: 'completed_at', direction: 'desc' }],
    });

    // Find the best recent run (longest distance with route data)
    let bestRun: { distance: number; time: number; date: Date } | null = null;

    for (const execution of recentExecutions) {
      // Check if this is a running workout
      const workoutType = await this.getWorkoutTypeForExecution(execution);
      if (workoutType !== WorkoutType.RUN && workoutType !== WorkoutType.CARDIO) {
        continue;
      }

      const route = await this.workoutRouteRepository.findByExecutionId(execution.id);
      if (!route || !execution.duration_seconds) continue;

      const distance = Number.parseFloat(route.total_distance_meters);
      const time = execution.duration_seconds;

      // Only use runs of at least 1km
      if (distance < 1000) continue;

      // Prefer longer distances
      if (!bestRun || distance > bestRun.distance) {
        const completedAt =
          execution.completed_at instanceof Date ? execution.completed_at : new Date(String(execution.completed_at));

        bestRun = { distance, time, date: completedAt };
      }
    }

    if (bestRun) {
      return {
        sourceType: 'recent_run',
        distanceMeters: bestRun.distance,
        timeSeconds: bestRun.time,
        achievedAt: bestRun.date.toISOString(),
        description: `${(bestRun.distance / 1000).toFixed(2)} km run`,
      };
    }

    return null;
  }

  private async getWorkoutTypeForExecution(execution: WorkoutExecution): Promise<WorkoutType> {
    if (execution.workout_schedule_id) {
      const schedule = await this.workoutScheduleRepository.findById(execution.workout_schedule_id);
      if (schedule) {
        const workout = await this.workoutRepository.findById(schedule.workout_id);
        if (workout) {
          return workout.type;
        }
      }
    }
    return this.inferWorkoutTypeFromNotes(execution.notes);
  }

  /**
   * Riegel's formula for race time prediction
   * T2 = T1 × (D2/D1)^1.06
   *
   * This is the most widely used formula for predicting race times.
   * The exponent 1.06 accounts for the fact that pace slows as distance increases.
   */
  private predictRaceTime(knownDistance: number, knownTime: number, targetDistance: number): number {
    const exponent = 1.06;
    return knownTime * Math.pow(targetDistance / knownDistance, exponent);
  }

  private formatRaceTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  private formatPace(secondsPerKm: number): string {
    const minutes = Math.floor(secondsPerKm / 60);
    const secs = Math.round(secondsPerKm % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')} /km`;
  }

  // ==================== Strength Progression Methods ====================

  async getStrengthProgression(
    req: Request & { user: AuthUser },
    exerciseId: string,
    query: StrengthProgressionQuery,
  ): Promise<StrengthProgressionResponse> {
    const days = query.days || 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get exercise info
    const exercise = await this.exerciseRepository.findById(exerciseId);
    if (!exercise) {
      throw new NotFoundException('Exercise not found');
    }

    // Get all completed workout executions for the user in the period
    const executions = await this.workoutExecutionRepository.findMany({
      filter: {
        userId: req.user.id,
        completedDateFrom: startDate,
        completedDateTo: new Date(),
        completed: true,
      },
      sort: [{ field: 'completed_at', direction: 'asc' }],
    });

    // Batch fetch all set completions for all executions
    const executionIds = executions.map((e) => e.id);
    const allSetCompletionsMap = await this.setCompletionRepository.findByExecutionIds(executionIds, false);

    // Collect all exercise instance IDs
    const allInstanceIds = new Set<string>();
    for (const completions of allSetCompletionsMap.values()) {
      for (const sc of completions) {
        allInstanceIds.add(sc.exercise_instance_id);
      }
    }

    // Batch fetch all exercise instances
    const allInstances = await this.exerciseInstanceRepository.findByIds([...allInstanceIds]);
    const instanceLookup = new Map(allInstances.map((i) => [i.id, i]));

    // Find which instance IDs match our target exercise
    const matchingInstanceIds = new Set<string>();
    for (const instance of allInstances) {
      if (instance.exercise_id === exerciseId) {
        matchingInstanceIds.add(instance.id);
      }
    }

    // Build data points for each execution
    const dataPointsMap = new Map<
      string,
      {
        sets: Array<{ weight: number; reps: number; rpe: number | null }>;
        date: Date;
      }
    >();

    for (const execution of executions) {
      const setCompletions = allSetCompletionsMap.get(execution.id) || [];

      // Filter to only sets for our target exercise
      const relevantSets = setCompletions.filter((sc) => matchingInstanceIds.has(sc.exercise_instance_id));
      if (relevantSets.length === 0) continue;

      const completedAt =
        execution.completed_at instanceof Date ? execution.completed_at : new Date(String(execution.completed_at));
      const dateKey = formatDateToYMD(completedAt);

      const existing = dataPointsMap.get(dateKey) || { sets: [], date: completedAt };

      for (const set of relevantSets) {
        if (set.actual_reps && set.actual_load) {
          existing.sets.push({
            weight: Number.parseFloat(set.actual_load),
            reps: set.actual_reps,
            rpe: set.rpe,
          });
        }
      }

      if (existing.sets.length > 0) {
        dataPointsMap.set(dateKey, existing);
      }
    }

    // Convert to data points
    const dataPoints: StrengthDataPointDTO[] = [];

    for (const [date, { sets }] of dataPointsMap) {
      if (sets.length === 0) continue;

      const maxWeight = Math.max(...sets.map((s) => s.weight));
      const maxReps = Math.max(...sets.map((s) => s.reps));
      const bestSetVolume = Math.max(...sets.map((s) => s.weight * s.reps));
      const totalVolume = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
      const totalSets = sets.length;

      // Calculate estimated 1RM using Brzycki formula: 1RM = weight × (36 / (37 - reps))
      // Use the set with the highest estimated 1RM
      const estimated1RM = Math.max(
        ...sets.map((s) => {
          if (s.reps >= 37) return s.weight; // Cap at 36 reps
          return s.weight * (36 / (37 - s.reps));
        }),
      );

      const rpesWithValue = sets.filter((s) => s.rpe !== null).map((s) => s.rpe!);
      const avgRpe =
        rpesWithValue.length > 0
          ? Math.round((rpesWithValue.reduce((a, b) => a + b, 0) / rpesWithValue.length) * 10) / 10
          : null;

      dataPoints.push({
        date,
        maxWeight: Math.round(maxWeight * 100) / 100,
        maxReps,
        bestSetVolume: Math.round(bestSetVolume * 100) / 100,
        totalVolume: Math.round(totalVolume * 100) / 100,
        totalSets,
        estimated1RM: Math.round(estimated1RM * 100) / 100,
        avgRpe,
      });
    }

    // Sort by date
    dataPoints.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate progress percentages
    let weightProgressPercent: number | null = null;
    let e1rmProgressPercent: number | null = null;

    if (dataPoints.length >= 2) {
      const first = dataPoints[0];
      const last = dataPoints[dataPoints.length - 1];

      if (first.maxWeight > 0) {
        weightProgressPercent = Math.round(((last.maxWeight - first.maxWeight) / first.maxWeight) * 1000) / 10;
      }
      if (first.estimated1RM > 0) {
        e1rmProgressPercent = Math.round(((last.estimated1RM - first.estimated1RM) / first.estimated1RM) * 1000) / 10;
      }
    }

    const data: StrengthProgressionDTO = {
      exerciseId,
      exerciseName: exercise.name,
      weightUnit: 'kg',
      dataPoints,
      totalSessions: dataPoints.length,
      weightProgressPercent,
      e1rmProgressPercent,
    };

    return { data };
  }

  async getTrackedExercises(req: Request & { user: AuthUser }): Promise<TrackedExercisesResponse> {
    // Get all completed workout executions for the user
    const executions = await this.workoutExecutionRepository.findMany({
      filter: {
        userId: req.user.id,
        completed: true,
      },
      sort: [{ field: 'completed_at', direction: 'desc' }],
    });

    if (executions.length === 0) {
      return { data: { exercises: [] } };
    }

    // Batch fetch all set completions for all executions
    const executionIds = executions.map((e) => e.id);
    const allSetCompletionsMap = await this.setCompletionRepository.findByExecutionIds(executionIds, false);

    // Collect all unique exercise instance IDs
    const allInstanceIds = new Set<string>();
    for (const completions of allSetCompletionsMap.values()) {
      for (const sc of completions) {
        allInstanceIds.add(sc.exercise_instance_id);
      }
    }

    // Batch fetch all exercise instances
    const allInstances = await this.exerciseInstanceRepository.findByIds([...allInstanceIds]);
    const instanceLookup = new Map(allInstances.map((i) => [i.id, i]));

    // Collect all unique exercise IDs
    const allExerciseIds = new Set<string>();
    for (const instance of allInstances) {
      allExerciseIds.add(instance.exercise_id);
    }

    // Batch fetch all exercises
    const allExercises = await this.exerciseRepository.findByIds([...allExerciseIds]);
    const exerciseLookup = new Map(allExercises.map((e) => [e.id, e]));

    // Track exercises with their stats
    const exerciseStats = new Map<
      string,
      {
        exerciseId: string;
        exerciseName: string;
        sessionCount: number;
        lastSessionDate: Date;
        maxWeight: number;
      }
    >();

    for (const execution of executions) {
      const setCompletions = allSetCompletionsMap.get(execution.id) || [];

      // Group sets by exercise
      const exerciseSets = new Map<string, typeof setCompletions>();
      for (const sc of setCompletions) {
        const instance = instanceLookup.get(sc.exercise_instance_id);
        if (!instance) continue;

        const existing = exerciseSets.get(instance.exercise_id) || [];
        existing.push(sc);
        exerciseSets.set(instance.exercise_id, existing);
      }

      const completedAt =
        execution.completed_at instanceof Date ? execution.completed_at : new Date(String(execution.completed_at));

      for (const [exerciseId, sets] of exerciseSets) {
        const existing = exerciseStats.get(exerciseId);

        // Only count if there's at least one weighted set
        const weightedSets = sets.filter((s) => s.actual_load && Number.parseFloat(s.actual_load) > 0);
        if (weightedSets.length === 0) continue;

        const sessionMaxWeight = Math.max(...weightedSets.map((s) => Number.parseFloat(s.actual_load!)));

        if (existing) {
          existing.sessionCount += 1;
          if (completedAt > existing.lastSessionDate) {
            existing.lastSessionDate = completedAt;
          }
          if (sessionMaxWeight > existing.maxWeight) {
            existing.maxWeight = sessionMaxWeight;
          }
        } else {
          const exercise = exerciseLookup.get(exerciseId);
          if (exercise) {
            exerciseStats.set(exerciseId, {
              exerciseId,
              exerciseName: exercise.name,
              sessionCount: 1,
              lastSessionDate: completedAt,
              maxWeight: sessionMaxWeight,
            });
          }
        }
      }
    }

    // Convert to array and sort by session count
    const exercises: TrackedExerciseDTO[] = Array.from(exerciseStats.values())
      .map((stats) => ({
        exerciseId: stats.exerciseId,
        exerciseName: stats.exerciseName,
        sessionCount: stats.sessionCount,
        lastSessionDate: formatDateToYMD(stats.lastSessionDate),
        currentMaxWeight: stats.maxWeight > 0 ? Math.round(stats.maxWeight * 100) / 100 : null,
      }))
      .sort((a, b) => b.sessionCount - a.sessionCount);

    const data: TrackedExercisesDTO = { exercises };
    return { data };
  }
}
