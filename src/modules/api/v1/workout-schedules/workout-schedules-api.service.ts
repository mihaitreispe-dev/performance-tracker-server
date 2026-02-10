import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { type Request } from 'express';
import { Workout, WorkoutSchedule } from 'src/database/interfaces';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutScheduleRepository, WorkoutScheduleFilter, WorkoutScheduleSort } from 'src/repositories/workout-schedule.repository';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import {
  CreateWorkoutScheduleBody,
  ListWorkoutSchedulesQuery,
  UpdateWorkoutScheduleBody,
} from './request.dto';
import {
  WorkoutScheduleDTO,
  WorkoutScheduleListResponse,
  WorkoutScheduleResponse,
  WorkoutInfoDTO,
} from './response.dto';

@Injectable()
export class WorkoutSchedulesApiService {
  constructor(
    private readonly workoutScheduleRepository: WorkoutScheduleRepository,
    private readonly workoutRepository: WorkoutRepository,
  ) {}

  async list(
    req: Request & { user: AuthUser },
    query: ListWorkoutSchedulesQuery,
  ): Promise<WorkoutScheduleListResponse> {
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
        filter,
        sort,
        offset: query.offset,
        limit: query.limit ?? 50,
      }),
      this.workoutScheduleRepository.countMany(filter),
    ]);

    // Fetch all workouts for the schedules
    const workoutIds = [...new Set(schedules.map((s) => s.workout_id))];
    const workouts = await Promise.all(
      workoutIds.map((id) => this.workoutRepository.findById(id)),
    );
    const workoutMap = new Map<string, Workout>();
    for (const workout of workouts) {
      if (workout) {
        workoutMap.set(workout.id, workout);
      }
    }

    const data = schedules.map((schedule) =>
      this.mapScheduleToDTO(schedule, workoutMap.get(schedule.workout_id)!),
    );

    return {
      data,
      offset: query.offset,
      limit: query.limit,
      totalCount,
    };
  }

  async getById(
    req: Request & { user: AuthUser },
    id: string,
  ): Promise<WorkoutScheduleResponse> {
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

  async create(
    req: Request & { user: AuthUser },
    body: CreateWorkoutScheduleBody,
  ): Promise<WorkoutScheduleResponse> {
    // Verify workout exists and belongs to user
    const workout = await this.workoutRepository.findById(body.workoutId);
    if (!workout) {
      throw new NotFoundException('Workout not found');
    }
    if (workout.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied to this workout');
    }

    const schedule = await this.workoutScheduleRepository.create({
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
      updateData.completed_at = body.completed ? new Date() : null;
    }

    const updatedSchedule = await this.workoutScheduleRepository.updateById(
      id,
      updateData as any,
    );

    const workout = await this.workoutRepository.findById(updatedSchedule.workout_id);
    if (!workout) {
      throw new NotFoundException('Workout not found');
    }

    return { data: this.mapScheduleToDTO(updatedSchedule, workout) };
  }

  async delete(
    req: Request & { user: AuthUser },
    id: string,
  ): Promise<void> {
    const schedule = await this.workoutScheduleRepository.findById(id);
    if (!schedule) {
      throw new NotFoundException('Workout schedule not found');
    }
    if (schedule.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    await this.workoutScheduleRepository.deleteById(id);
  }

  private mapScheduleToDTO(schedule: WorkoutSchedule, workout: Workout): WorkoutScheduleDTO {
    const workoutInfo: WorkoutInfoDTO = {
      id: workout.id,
      name: workout.name,
      description: workout.description,
      difficulty: workout.difficulty,
      type: workout.type,
    };

    const scheduledDate = schedule.scheduled_date instanceof Date
      ? schedule.scheduled_date.toISOString().split('T')[0]
      : String(schedule.scheduled_date);
    const completedAt = schedule.completed_at
      ? (schedule.completed_at instanceof Date
          ? schedule.completed_at.toISOString()
          : String(schedule.completed_at))
      : null;
    const createdAt = schedule.created_at instanceof Date
      ? schedule.created_at.toISOString()
      : String(schedule.created_at);
    const updatedAt = schedule.updated_at instanceof Date
      ? schedule.updated_at.toISOString()
      : String(schedule.updated_at);

    return {
      id: schedule.id,
      userId: schedule.user_id,
      workout: workoutInfo,
      scheduledDate,
      completedAt,
      createdAt,
      updatedAt,
    };
  }
}
