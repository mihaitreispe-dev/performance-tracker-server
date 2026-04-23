import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import {
  CardioMetric,
  CoachAthleteStatus,
  GeoJSONLineString,
  RouteMarker,
  SetCompletion,
  Workout,
  WorkoutExecution,
  WorkoutExecutionSource,
  WorkoutRoute,
  WorkoutSchedule,
} from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { WeatherService } from 'src/modules/weather/weather.service';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { ExecutionWeatherRepository } from 'src/repositories/execution-weather.repository';
import { RpeTssTrackingRepository } from 'src/repositories/rpe-tss-tracking.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { TrainingStressRepository } from 'src/repositories/training-stress.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import {
  WorkoutExecutionFilter,
  WorkoutExecutionRepository,
  WorkoutExecutionSort,
} from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { PersonalRecordsDetectionService } from '../personal-records/personal-records-detection.service';
import { WorkoutInfoDTO } from '../workout-schedules/response.dto';
import {
  BatchUploadMetricsBody,
  CompleteSetBody,
  ListMetricsQuery,
  ListSetCompletionsQuery,
  ListWorkoutExecutionsQuery,
  StartWorkoutExecutionBody,
  UpdateSessionRPEBody,
  UpdateWorkoutExecutionBody,
  UploadRouteBody,
} from './request.dto';
import {
  BatchUploadMetricsResponse,
  CardioMetricDTO,
  CardioMetricListResponse,
  RouteMarkerDTO,
  SessionRPEDTO,
  SessionRPEResponse,
  SetCompletionDTO,
  SetCompletionListResponse,
  SetCompletionResponse,
  WorkoutExecutionDTO,
  WorkoutExecutionListResponse,
  WorkoutExecutionResponse,
  WorkoutRouteDTO,
  WorkoutRouteResponse,
} from './response.dto';

@Injectable()
export class WorkoutExecutionsApiService {
  private readonly logger = new Logger(WorkoutExecutionsApiService.name);

  constructor(
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly setCompletionRepository: SetCompletionRepository,
    private readonly cardioMetricsRepository: CardioMetricsRepository,
    private readonly workoutRouteRepository: WorkoutRouteRepository,
    private readonly workoutScheduleRepository: WorkoutScheduleRepository,
    private readonly workoutRepository: WorkoutRepository,
    private readonly personalRecordsDetectionService: PersonalRecordsDetectionService,
    private readonly weatherService: WeatherService,
    private readonly executionWeatherRepository: ExecutionWeatherRepository,
    private readonly relationshipRepository: CoachAthleteRelationshipRepository,
    private readonly privacySettingsRepository: AthletePrivacySettingsRepository,
    private readonly rpeTssTrackingRepository: RpeTssTrackingRepository,
    private readonly trainingStressRepository: TrainingStressRepository,
  ) {}

  // Workout Executions

  async list(
    req: Request & { user: AuthUser },
    query: ListWorkoutExecutionsQuery,
  ): Promise<WorkoutExecutionListResponse> {
    const filter: WorkoutExecutionFilter = {
      userId: req.user.id,
      workoutScheduleId: query.workoutScheduleId,
      source: query.source,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      completed: query.completed,
    };

    const sort: WorkoutExecutionSort[] | undefined = query.sort?.map((s) => ({
      field: s.field as 'started_at' | 'completed_at' | 'created_at' | 'updated_at',
      direction: s.direction,
    }));

    const [executions, totalCount] = await Promise.all([
      this.workoutExecutionRepository.findMany({
        filter,
        sort,
        offset: query.offset,
        limit: query.limit ?? 50,
      }),
      this.workoutExecutionRepository.countMany(filter),
    ]);

    // Fetch workouts for executions that have schedule IDs using bulk fetch
    const scheduleIds = [
      ...new Set(executions.filter((e) => e.workout_schedule_id).map((e) => e.workout_schedule_id!)),
    ];
    const scheduleMap = new Map<string, WorkoutSchedule>();
    const workoutMap = new Map<string, Workout>();

    if (scheduleIds.length > 0) {
      // Bulk fetch schedules instead of N individual queries
      const schedules = await this.workoutScheduleRepository.findByIds(scheduleIds);
      for (const schedule of schedules) {
        scheduleMap.set(schedule.id, schedule);
      }

      // Bulk fetch workouts instead of N individual queries
      const workoutIds = [...new Set([...scheduleMap.values()].map((s) => s.workout_id))];
      const workouts = await this.workoutRepository.findByIds(workoutIds);
      for (const workout of workouts) {
        workoutMap.set(workout.id, workout);
      }
    }

    const data = executions.map((execution) => {
      const schedule = execution.workout_schedule_id ? scheduleMap.get(execution.workout_schedule_id) : undefined;
      const workout = schedule ? workoutMap.get(schedule.workout_id) : undefined;
      return this.mapExecutionToDTO(execution, workout);
    });

    return {
      data,
      offset: query.offset,
      limit: query.limit,
      totalCount,
    };
  }

  async getById(req: Request & { user: AuthUser }, id: string): Promise<WorkoutExecutionResponse> {
    const execution = await this.workoutExecutionRepository.findById(id);
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

    let workout: Workout | undefined;
    if (execution.workout_schedule_id) {
      const schedule = await this.workoutScheduleRepository.findById(execution.workout_schedule_id);
      if (schedule) {
        workout = await this.workoutRepository.findById(schedule.workout_id);
      }
    }

    return { data: this.mapExecutionToDTO(execution, workout) };
  }

  async start(req: Request & { user: AuthUser }, body: StartWorkoutExecutionBody): Promise<WorkoutExecutionResponse> {
    // Verify schedule exists and belongs to user
    const schedule = await this.workoutScheduleRepository.findById(body.workoutScheduleId);
    if (!schedule) {
      throw new NotFoundException('Workout schedule not found');
    }
    if (schedule.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied to this workout schedule');
    }

    const execution = await this.workoutExecutionRepository.create({
      user_id: req.user.id,
      workout_schedule_id: body.workoutScheduleId,
      started_at: body.startedAt ? new Date(body.startedAt) : new Date(),
      source: WorkoutExecutionSource.MANUAL,
      notes: body.notes ?? null,
    });

    const workout = await this.workoutRepository.findById(schedule.workout_id);

    return { data: this.mapExecutionToDTO(execution, workout) };
  }

  async update(
    req: Request & { user: AuthUser },
    id: string,
    body: UpdateWorkoutExecutionBody,
  ): Promise<WorkoutExecutionResponse> {
    const execution = await this.workoutExecutionRepository.findById(id);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    const updateData: Record<string, unknown> = {};
    if (body.completedAt !== undefined) {
      updateData.completed_at = new Date(body.completedAt);
    }
    if (body.durationSeconds !== undefined) {
      updateData.duration_seconds = body.durationSeconds;
    }
    if (body.notes !== undefined) {
      updateData.notes = body.notes;
    }

    const updatedExecution = await this.workoutExecutionRepository.updateById(id, updateData as any);

    // Also mark the schedule as completed if the execution is completed
    // and move the scheduled_date to the completion date if they differ
    if (body.completedAt && updatedExecution.workout_schedule_id) {
      const completionDate = new Date(body.completedAt);
      // Use UTC methods to avoid timezone issues
      const completionDateOnly = new Date(
        Date.UTC(completionDate.getUTCFullYear(), completionDate.getUTCMonth(), completionDate.getUTCDate()),
      );

      await this.workoutScheduleRepository.updateById(updatedExecution.workout_schedule_id, {
        completed_at: completionDate,
        scheduled_date: completionDateOnly,
      });
    }

    // Trigger PR detection asynchronously when workout is completed
    if (body.completedAt) {
      this.personalRecordsDetectionService.detectAndStorePRs(id, req.user.id).catch((error) => {
        this.logger.error(`Failed to detect PRs for execution ${id}:`, error);
      });

      // Trigger weather fetch asynchronously for workouts with route data
      this.triggerWeatherFetch(id, updatedExecution.started_at);
    }

    let workout: Workout | undefined;
    if (updatedExecution.workout_schedule_id) {
      const schedule = await this.workoutScheduleRepository.findById(updatedExecution.workout_schedule_id);
      if (schedule) {
        workout = await this.workoutRepository.findById(schedule.workout_id);
      }
    }

    return { data: this.mapExecutionToDTO(updatedExecution, workout) };
  }

  async delete(req: Request & { user: AuthUser }, id: string): Promise<void> {
    const execution = await this.workoutExecutionRepository.findById(id);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    await this.workoutExecutionRepository.deleteById(id);
  }

  // Session RPE

  async updateSessionRPE(
    req: Request & { user: AuthUser },
    id: string,
    body: UpdateSessionRPEBody,
  ): Promise<SessionRPEResponse> {
    const execution = await this.workoutExecutionRepository.findById(id);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Workout must be completed to record session RPE
    if (!execution.completed_at || !execution.duration_seconds) {
      throw new BadRequestException('Workout must be completed with duration to record session RPE');
    }

    const now = new Date();
    const durationMinutes = execution.duration_seconds / 60;

    // Calculate sRPE-TSS using Foster method: RPE × duration in minutes
    const srpeTss = body.sessionRpe * durationMinutes;

    // Get calculated TSS from training stress scores (if available)
    const trainingStress = await this.trainingStressRepository.findByWorkoutExecutionId(id);
    const calculatedTss = trainingStress?.tss ? Number.parseFloat(trainingStress.tss) : null;

    // Calculate RPE:TSS ratio
    let rpeTssRatio: number | null = null;
    if (calculatedTss && calculatedTss > 0) {
      rpeTssRatio = srpeTss / calculatedTss;
    }

    // Check for accumulated fatigue (average ratio > 1.3 over last 7 days)
    const avgRatio = await this.rpeTssTrackingRepository.getAverageRatio(req.user.id, 7);
    const accumulatedFatigueFlag = avgRatio !== null && avgRatio > 1.3;

    // Update workout execution with session RPE
    await this.workoutExecutionRepository.updateById(id, {
      session_rpe: body.sessionRpe,
      srpe_tss: srpeTss.toFixed(2),
      rpe_collected_at: now,
    });

    // Create or update tracking record
    const existingTracking = await this.rpeTssTrackingRepository.findByWorkoutExecutionId(id);
    if (existingTracking) {
      await this.rpeTssTrackingRepository.updateById(existingTracking.id, {
        session_rpe: body.sessionRpe,
        srpe_tss: srpeTss.toFixed(2),
        calculated_tss: calculatedTss?.toFixed(2) ?? null,
        rpe_tss_ratio: rpeTssRatio?.toFixed(2) ?? null,
        accumulated_fatigue_flag: accumulatedFatigueFlag,
      });
    } else {
      await this.rpeTssTrackingRepository.create({
        user_id: req.user.id,
        workout_execution_id: id,
        session_rpe: body.sessionRpe,
        srpe_tss: srpeTss.toFixed(2),
        calculated_tss: calculatedTss?.toFixed(2) ?? null,
        rpe_tss_ratio: rpeTssRatio?.toFixed(2) ?? null,
        accumulated_fatigue_flag: accumulatedFatigueFlag,
      });
    }

    const responseData: SessionRPEDTO = {
      sessionRpe: body.sessionRpe,
      srpeTss,
      calculatedTss,
      rpeTssRatio,
      accumulatedFatigueFlag,
      rpeCollectedAt: now.toISOString(),
    };

    return { data: responseData };
  }

  async getSessionRPE(req: Request & { user: AuthUser }, id: string): Promise<SessionRPEResponse> {
    const execution = await this.workoutExecutionRepository.findById(id);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }

    // Check if user owns the execution or is a coach with access
    if (execution.user_id !== req.user.id) {
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

    if (!execution.session_rpe) {
      throw new NotFoundException('Session RPE not recorded for this workout');
    }

    const tracking = await this.rpeTssTrackingRepository.findByWorkoutExecutionId(id);

    const responseData: SessionRPEDTO = {
      sessionRpe: execution.session_rpe,
      srpeTss: execution.srpe_tss ? Number.parseFloat(execution.srpe_tss) : 0,
      calculatedTss: tracking?.calculated_tss ? Number.parseFloat(tracking.calculated_tss) : null,
      rpeTssRatio: tracking?.rpe_tss_ratio ? Number.parseFloat(tracking.rpe_tss_ratio) : null,
      accumulatedFatigueFlag: tracking?.accumulated_fatigue_flag ?? false,
      rpeCollectedAt: execution.rpe_collected_at
        ? new Date(execution.rpe_collected_at).toISOString()
        : new Date().toISOString(),
    };

    return { data: responseData };
  }

  // Set Completions

  async completeSet(
    req: Request & { user: AuthUser },
    executionId: string,
    body: CompleteSetBody,
  ): Promise<SetCompletionResponse> {
    const execution = await this.workoutExecutionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Check if set completion already exists
    const existing = await this.setCompletionRepository.findByExecutionAndSet(
      executionId,
      body.exerciseInstanceId,
      body.setNumber,
    );

    let setCompletion: SetCompletion;
    if (existing) {
      // Update existing
      setCompletion = await this.setCompletionRepository.updateById(existing.id, {
        actual_reps: body.actualReps ?? null,
        actual_load: body.actualLoad?.toString() ?? null,
        actual_time_seconds: body.actualTimeSeconds ?? null,
        rpe: body.rpe ?? null,
        skipped: body.skipped ?? false,
        notes: body.notes ?? null,
        completed_at: new Date(),
      });
    } else {
      // Create new
      setCompletion = await this.setCompletionRepository.create({
        workout_execution_id: executionId,
        exercise_instance_id: body.exerciseInstanceId,
        set_number: body.setNumber,
        actual_reps: body.actualReps ?? null,
        actual_load: body.actualLoad?.toString() ?? null,
        actual_time_seconds: body.actualTimeSeconds ?? null,
        rpe: body.rpe ?? null,
        completed_at: new Date(),
        skipped: body.skipped ?? false,
        notes: body.notes ?? null,
      });
    }

    return { data: this.mapSetCompletionToDTO(setCompletion) };
  }

  async listSetCompletions(
    req: Request & { user: AuthUser },
    executionId: string,
    query: ListSetCompletionsQuery,
  ): Promise<SetCompletionListResponse> {
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

    const setCompletions = await this.setCompletionRepository.findMany({
      filter: {
        workoutExecutionId: executionId,
        exerciseInstanceId: query.exerciseInstanceId,
      },
      sort: [{ field: 'set_number', direction: 'asc' }],
    });

    return {
      data: setCompletions.map((sc) => this.mapSetCompletionToDTO(sc)),
    };
  }

  // Cardio Metrics

  async uploadMetrics(
    req: Request & { user: AuthUser },
    executionId: string,
    body: BatchUploadMetricsBody,
  ): Promise<BatchUploadMetricsResponse> {
    const execution = await this.workoutExecutionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    if (body.metrics.length === 0) {
      return { count: 0 };
    }

    const metricsToCreate = body.metrics.map((m) => ({
      workout_execution_id: executionId,
      metric_type: m.metricType,
      recorded_at: new Date(m.recordedAt),
      value: m.value.toString(),
      unit: m.unit,
    }));

    const created = await this.cardioMetricsRepository.createMany(metricsToCreate);
    return { count: created.length };
  }

  async listMetrics(
    req: Request & { user: AuthUser },
    executionId: string,
    query: ListMetricsQuery,
  ): Promise<CardioMetricListResponse> {
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

    const metrics = await this.cardioMetricsRepository.findMany({
      filter: {
        workoutExecutionId: executionId,
        metricType: query.metricType,
      },
    });

    return {
      data: metrics.map((m) => this.mapCardioMetricToDTO(m)),
    };
  }

  // Routes

  async uploadRoute(
    req: Request & { user: AuthUser },
    executionId: string,
    body: UploadRouteBody,
  ): Promise<WorkoutRouteResponse> {
    const execution = await this.workoutExecutionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Check if route already exists
    const existingRoute = await this.workoutRouteRepository.findByExecutionId(executionId);
    if (existingRoute) {
      throw new BadRequestException('Route already exists for this execution');
    }

    const route = await this.workoutRouteRepository.create({
      workout_execution_id: executionId,
      route_geojson: body.routeGeojson as GeoJSONLineString,
      total_distance_meters: body.totalDistanceMeters.toString(),
      elevation_gain_meters: body.elevationGainMeters?.toString() ?? null,
      elevation_loss_meters: body.elevationLossMeters?.toString() ?? null,
    });

    let markers: RouteMarker[] = [];
    if (body.markers && body.markers.length > 0) {
      const markersToCreate = body.markers.map((m) => ({
        workout_route_id: route.id,
        marker_type: m.markerType,
        marker_number: m.markerNumber,
        latitude: m.latitude.toString(),
        longitude: m.longitude.toString(),
        elevation_meters: m.elevationMeters?.toString() ?? null,
        recorded_at: new Date(m.recordedAt),
        split_time_seconds: m.splitTimeSeconds,
        cumulative_time_seconds: m.cumulativeTimeSeconds,
        avg_heart_rate: m.avgHeartRate ?? null,
        avg_pace_seconds_per_km: m.avgPaceSecondsPerKm ?? null,
      }));
      markers = await this.workoutRouteRepository.createMarkers(markersToCreate);
    }

    return { data: this.mapWorkoutRouteToDTO(route, markers) };
  }

  async getRoute(req: Request & { user: AuthUser }, executionId: string): Promise<WorkoutRouteResponse> {
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

    const route = await this.workoutRouteRepository.findByExecutionId(executionId);
    if (!route) {
      throw new NotFoundException('Route not found for this execution');
    }

    const markers = await this.workoutRouteRepository.findMarkersByRouteId(route.id);

    return { data: this.mapWorkoutRouteToDTO(route, markers) };
  }

  // Weather

  /**
   * Trigger weather fetch asynchronously for a workout execution that has route data.
   * Weather is fetched from the first coordinate of the route at the workout start time.
   */
  private triggerWeatherFetch(executionId: string, startedAt: Date | string): void {
    (async () => {
      try {
        // Check if route exists for this execution
        const route = await this.workoutRouteRepository.findByExecutionId(executionId);
        if (!route) {
          this.logger.debug(`No route found for execution ${executionId}, skipping weather fetch`);
          return;
        }

        // Extract coordinates from route GeoJSON (format: [longitude, latitude])
        const coordinates = route.route_geojson.coordinates;
        if (!coordinates || coordinates.length === 0) {
          this.logger.debug(`No coordinates in route for execution ${executionId}, skipping weather fetch`);
          return;
        }

        const [longitude, latitude] = coordinates[0];
        const workoutStartedAt = startedAt instanceof Date ? startedAt : new Date(startedAt);

        // Fetch weather asynchronously
        await this.weatherService.fetchAndStoreWeather({
          workoutExecutionId: executionId,
          latitude,
          longitude,
          startedAt: workoutStartedAt,
        });
      } catch (error) {
        this.logger.error(`Failed to fetch weather for execution ${executionId}:`, error);
      }
    })();
  }

  // Mappers

  private mapExecutionToDTO(execution: WorkoutExecution, workout?: Workout): WorkoutExecutionDTO {
    const startedAt =
      execution.started_at instanceof Date ? execution.started_at.toISOString() : String(execution.started_at);
    const completedAt = execution.completed_at
      ? execution.completed_at instanceof Date
        ? execution.completed_at.toISOString()
        : String(execution.completed_at)
      : null;
    const createdAt =
      execution.created_at instanceof Date ? execution.created_at.toISOString() : String(execution.created_at);
    const updatedAt =
      execution.updated_at instanceof Date ? execution.updated_at.toISOString() : String(execution.updated_at);

    let workoutInfo: WorkoutInfoDTO | null = null;
    if (workout) {
      workoutInfo = {
        id: workout.id,
        name: workout.name,
        description: workout.description,
        difficulty: workout.difficulty,
        type: workout.type,
      };
    }

    const rpeCollectedAt = execution.rpe_collected_at
      ? execution.rpe_collected_at instanceof Date
        ? execution.rpe_collected_at.toISOString()
        : String(execution.rpe_collected_at)
      : null;

    return {
      id: execution.id,
      userId: execution.user_id,
      workoutScheduleId: execution.workout_schedule_id,
      workout: workoutInfo,
      startedAt,
      completedAt,
      durationSeconds: execution.duration_seconds,
      source: execution.source,
      externalId: execution.external_id,
      notes: execution.notes,
      sessionRpe: execution.session_rpe,
      srpeTss: execution.srpe_tss ? Number.parseFloat(execution.srpe_tss) : null,
      rpeCollectedAt,
      createdAt,
      updatedAt,
    };
  }

  private mapSetCompletionToDTO(sc: SetCompletion): SetCompletionDTO {
    const completedAt = sc.completed_at instanceof Date ? sc.completed_at.toISOString() : String(sc.completed_at);
    const createdAt = sc.created_at instanceof Date ? sc.created_at.toISOString() : String(sc.created_at);

    return {
      id: sc.id,
      workoutExecutionId: sc.workout_execution_id,
      exerciseInstanceId: sc.exercise_instance_id,
      setNumber: sc.set_number,
      actualReps: sc.actual_reps,
      actualLoad: sc.actual_load ? Number.parseFloat(sc.actual_load) : null,
      actualTimeSeconds: sc.actual_time_seconds,
      rpe: sc.rpe,
      completedAt,
      skipped: sc.skipped,
      notes: sc.notes,
      createdAt,
    };
  }

  private mapCardioMetricToDTO(m: CardioMetric): CardioMetricDTO {
    const recordedAt = m.recorded_at instanceof Date ? m.recorded_at.toISOString() : String(m.recorded_at);
    const createdAt = m.created_at instanceof Date ? m.created_at.toISOString() : String(m.created_at);

    return {
      id: m.id,
      workoutExecutionId: m.workout_execution_id,
      metricType: m.metric_type,
      recordedAt,
      value: Number.parseFloat(m.value),
      unit: m.unit,
      createdAt,
    };
  }

  private mapRouteMarkerToDTO(marker: RouteMarker): RouteMarkerDTO {
    const recordedAt =
      marker.recorded_at instanceof Date ? marker.recorded_at.toISOString() : String(marker.recorded_at);

    return {
      id: marker.id,
      markerType: marker.marker_type,
      markerNumber: marker.marker_number,
      latitude: Number.parseFloat(marker.latitude),
      longitude: Number.parseFloat(marker.longitude),
      elevationMeters: marker.elevation_meters ? Number.parseFloat(marker.elevation_meters) : null,
      recordedAt,
      splitTimeSeconds: marker.split_time_seconds,
      cumulativeTimeSeconds: marker.cumulative_time_seconds,
      avgHeartRate: marker.avg_heart_rate,
      avgPaceSecondsPerKm: marker.avg_pace_seconds_per_km,
    };
  }

  private mapWorkoutRouteToDTO(route: WorkoutRoute, markers: RouteMarker[]): WorkoutRouteDTO {
    const createdAt = route.created_at instanceof Date ? route.created_at.toISOString() : String(route.created_at);

    return {
      id: route.id,
      workoutExecutionId: route.workout_execution_id,
      routeGeojson: route.route_geojson as any,
      totalDistanceMeters: Number.parseFloat(route.total_distance_meters),
      elevationGainMeters: route.elevation_gain_meters ? Number.parseFloat(route.elevation_gain_meters) : null,
      elevationLossMeters: route.elevation_loss_meters ? Number.parseFloat(route.elevation_loss_meters) : null,
      markers: markers.map((m) => this.mapRouteMarkerToDTO(m)),
      createdAt,
    };
  }
}
