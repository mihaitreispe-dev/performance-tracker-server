import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { Workout, WorkoutExecution, WorkoutSchedule } from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';
import { assertActiveOrg } from 'src/lib/util/active-org';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import {
  WorkoutScheduleFilter,
  WorkoutScheduleRepository,
  WorkoutScheduleSort,
} from 'src/repositories/workout-schedule.repository';

import { CreateWorkoutScheduleBody, ListWorkoutSchedulesQuery, UpdateWorkoutScheduleBody } from './request.dto';
import {
  ExecutionSummaryDTO,
  WorkoutInfoDTO,
  WorkoutScheduleDTO,
  WorkoutScheduleListResponse,
  WorkoutScheduleResponse,
} from './response.dto';

@Injectable()
export class WorkoutSchedulesApiService {
  constructor(
    private readonly workoutScheduleRepository: WorkoutScheduleRepository,
    private readonly workoutRepository: WorkoutRepository,
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly workoutRouteRepository: WorkoutRouteRepository,
  ) {}

  async list(
    req: AuthedRequest,
    query: ListWorkoutSchedulesQuery,
  ): Promise<WorkoutScheduleListResponse> {
    const organisationId = assertActiveOrg(req);
    const filter: WorkoutScheduleFilter = {
      userId: req.user.id,
      workoutId: query.workoutId,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      completed: query.completed,
    };

    const sort: WorkoutScheduleSort[] | undefined = query.sort?.map((s) => ({
      field: s.field as 'scheduled_date' | 'created_at' | 'updated_at',
      direction: s.direction,
    }));

    const [schedules, totalCount] = await Promise.all([
      this.workoutScheduleRepository.findMany({
        organisationId,
        filter,
        sort,
        offset: query.offset,
        limit: query.limit ?? 50,
      }),
      this.workoutScheduleRepository.countMany(organisationId, filter),
    ]);

    // Fetch all workouts for the schedules
    const workoutIds = [...new Set(schedules.map((s) => s.workout_id))];
    const workouts = await Promise.all(workoutIds.map((id) => this.workoutRepository.findById(id)));
    const workoutMap = new Map<string, Workout>();
    for (const workout of workouts) {
      if (workout) {
        workoutMap.set(workout.id, workout);
      }
    }

    // Fetch execution data if requested
    let executionMap = new Map<string, ExecutionSummaryDTO>();
    if (query.includeExecution) {
      const scheduleIds = schedules.map((s) => s.id);
      executionMap = await this.getExecutionSummaries(scheduleIds);
    }

    const data = schedules.map((schedule) =>
      this.mapScheduleToDTO(
        schedule,
        workoutMap.get(schedule.workout_id)!,
        query.includeExecution ? executionMap.get(schedule.id) : undefined,
      ),
    );

    return {
      data,
      offset: query.offset,
      limit: query.limit,
      totalCount,
    };
  }

  private async getExecutionSummaries(scheduleIds: string[]): Promise<Map<string, ExecutionSummaryDTO>> {
    const result = new Map<string, ExecutionSummaryDTO>();
    if (scheduleIds.length === 0) return result;

    // Fetch executions for all schedule IDs
    const executions = await Promise.all(
      scheduleIds.map((id) =>
        this.workoutExecutionRepository.findMany({
          filter: { workoutScheduleId: id },
          limit: 1,
          sort: [{ field: 'started_at', direction: 'desc' }],
        }),
      ),
    );

    // Flatten and get route data
    const executionList: WorkoutExecution[] = [];
    for (const execs of executions) {
      if (execs.length > 0) {
        executionList.push(execs[0]);
      }
    }

    // Fetch routes for all executions
    const routes = await Promise.all(executionList.map((e) => this.workoutRouteRepository.findByExecutionId(e.id)));

    // Build the map
    for (let i = 0; i < executionList.length; i++) {
      const execution = executionList[i];
      const route = routes[i];

      if (!execution.workout_schedule_id) continue;

      const distanceMeters = route ? Number.parseFloat(route.total_distance_meters) : null;
      const elevationGainMeters = route?.elevation_gain_meters ? Number.parseFloat(route.elevation_gain_meters) : null;
      const durationSeconds = execution.duration_seconds ?? null;

      let paceSecondsPerKm: number | null = null;
      if (distanceMeters && durationSeconds && distanceMeters > 0) {
        paceSecondsPerKm = Math.round((durationSeconds / distanceMeters) * 1000);
      }

      const startedAt =
        execution.started_at instanceof Date ? execution.started_at.toISOString() : String(execution.started_at);

      const completedAt = execution.completed_at
        ? execution.completed_at instanceof Date
          ? execution.completed_at.toISOString()
          : String(execution.completed_at)
        : null;

      result.set(execution.workout_schedule_id, {
        id: execution.id,
        durationSeconds,
        distanceMeters,
        paceSecondsPerKm,
        startedAt,
        completedAt,
        // TODO: Populate these from cardio metrics data when available
        // Currently set to null as placeholders for future enhancement
        avgHeartRate: null,
        maxHeartRate: null,
        minHeartRate: null,
        elevationGainMeters,
        caloriesBurned: null,
      });
    }

    return result;
  }

  async getById(req: Request & { user: AuthUser }, id: string): Promise<WorkoutScheduleResponse> {
    const schedule = await this.workoutScheduleRepository.findById(id);
    if (!schedule) {
      throw new NotFoundException('Workout schedule not found');
    }
    if (schedule.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    const workout = await this.workoutRepository.findById(schedule.workout_id);
    if (!workout) {
      throw new NotFoundException('Workout not found');
    }

    return { data: this.mapScheduleToDTO(schedule, workout) };
  }

  async create(req: AuthedRequest, body: CreateWorkoutScheduleBody): Promise<WorkoutScheduleResponse> {
    const organisationId = assertActiveOrg(req);
    // Verify workout exists and belongs to user
    const workout = await this.workoutRepository.findById(body.workoutId);
    if (!workout) {
      throw new NotFoundException('Workout not found');
    }
    if (workout.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied to this workout');
    }

    const schedule = await this.workoutScheduleRepository.create({
      organisation_id: organisationId,
      user_id: req.user.id,
      workout_id: body.workoutId,
      scheduled_date: new Date(body.scheduledDate),
    });

    return { data: this.mapScheduleToDTO(schedule, workout) };
  }

  async update(
    req: Request & { user: AuthUser },
    id: string,
    body: UpdateWorkoutScheduleBody,
  ): Promise<WorkoutScheduleResponse> {
    const schedule = await this.workoutScheduleRepository.findById(id);
    if (!schedule) {
      throw new NotFoundException('Workout schedule not found');
    }
    if (schedule.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    const updateData: Record<string, unknown> = {};
    if (body.scheduledDate !== undefined) {
      updateData.scheduled_date = new Date(body.scheduledDate);
    }
    if (body.completed !== undefined) {
      // Use current date/time for completion timestamp (when user actually marks it complete)
      updateData.completed_at = body.completed ? new Date() : null;
    }

    const updatedSchedule = await this.workoutScheduleRepository.updateById(id, updateData as any);

    const workout = await this.workoutRepository.findById(updatedSchedule.workout_id);
    if (!workout) {
      throw new NotFoundException('Workout not found');
    }

    return { data: this.mapScheduleToDTO(updatedSchedule, workout) };
  }

  async delete(req: Request & { user: AuthUser }, id: string): Promise<void> {
    const schedule = await this.workoutScheduleRepository.findById(id);
    if (!schedule) {
      throw new NotFoundException('Workout schedule not found');
    }
    if (schedule.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    await this.workoutScheduleRepository.deleteById(id);
  }

  private mapScheduleToDTO(
    schedule: WorkoutSchedule,
    workout: Workout,
    execution?: ExecutionSummaryDTO,
  ): WorkoutScheduleDTO {
    const workoutInfo: WorkoutInfoDTO = {
      id: workout.id,
      name: workout.name,
      description: workout.description,
      difficulty: workout.difficulty,
      type: workout.type,
    };

    const scheduledDate =
      schedule.scheduled_date instanceof Date
        ? formatDateToYMD(schedule.scheduled_date)
        : String(schedule.scheduled_date);
    const completedAt = schedule.completed_at
      ? schedule.completed_at instanceof Date
        ? schedule.completed_at.toISOString()
        : String(schedule.completed_at)
      : null;
    const createdAt =
      schedule.created_at instanceof Date ? schedule.created_at.toISOString() : String(schedule.created_at);
    const updatedAt =
      schedule.updated_at instanceof Date ? schedule.updated_at.toISOString() : String(schedule.updated_at);

    return {
      id: schedule.id,
      userId: schedule.user_id,
      workout: workoutInfo,
      scheduledDate,
      completedAt,
      execution: execution ?? undefined,
      createdAt,
      updatedAt,
    };
  }
}
