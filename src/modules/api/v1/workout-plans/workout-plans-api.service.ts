import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { Workout, WorkoutPlan, WorkoutPlanItem } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutItemRepository } from 'src/repositories/workout-item.repository';
import { WorkoutPlanRepository, WorkoutPlanSort } from 'src/repositories/workout-plan.repository';
import { WorkoutPlanItemRepository } from 'src/repositories/workout-plan-item.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import {
  ActivatePlanBody,
  AddWorkoutPlanItemBody,
  CreateWorkoutPlanBody,
  ListWorkoutPlansQuery,
  UpdateWorkoutPlanBody,
} from './request.dto';
import {
  ActivatePlanResponse,
  WorkoutInfoForPlanDTO,
  WorkoutPlanDTO,
  WorkoutPlanItemDTO,
  WorkoutPlanItemResponse,
  WorkoutPlanListResponse,
  WorkoutPlanResponse,
  WorkoutPlanWithItemsDTO,
  WorkoutPlanWithItemsResponse,
} from './response.dto';

@Injectable()
export class WorkoutPlansApiService {
  constructor(
    private readonly workoutPlanRepo: WorkoutPlanRepository,
    private readonly workoutPlanItemRepo: WorkoutPlanItemRepository,
    private readonly workoutRepo: WorkoutRepository,
    private readonly workoutScheduleRepo: WorkoutScheduleRepository,
    private readonly workoutItemRepo: WorkoutItemRepository,
  ) {}

  async list(req: Request & { user: AuthUser }, query: ListWorkoutPlansQuery): Promise<WorkoutPlanListResponse> {
    const filter = {
      userId: req.user.id,
      q: query.q,
      goal: query.goal,
    };

    const sort: WorkoutPlanSort[] | undefined = query.sort?.map((s) => ({
      field: s.field as 'name' | 'duration_weeks' | 'created_at' | 'updated_at',
      direction: s.direction,
    }));

    const [plans, totalCount] = await Promise.all([
      this.workoutPlanRepo.findMany({
        filter,
        sort,
        offset: query.offset,
        limit: query.limit ?? 50,
      }),
      this.workoutPlanRepo.countMany(filter),
    ]);

    const data = plans.map((plan) => this.mapPlanToDTO(plan));

    return {
      data,
      offset: query.offset,
      limit: query.limit,
      totalCount,
    };
  }

  async getById(req: Request & { user: AuthUser }, id: string): Promise<WorkoutPlanWithItemsResponse> {
    const plan = await this.workoutPlanRepo.findById(id);
    if (!plan) {
      throw new NotFoundException('Workout plan not found');
    }
    if (plan.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    const items = await this.workoutPlanItemRepo.findMany({
      filter: { workoutPlanId: id },
    });

    // Fetch workouts for items
    const workoutIds = [...new Set(items.map((item) => item.workout_id))];
    const workouts = await Promise.all(workoutIds.map((wid) => this.workoutRepo.findById(wid)));
    const workoutMap = new Map<string, Workout>();
    for (const workout of workouts) {
      if (workout) {
        workoutMap.set(workout.id, workout);
      }
    }

    // Fetch exercise counts for each workout
    const exerciseCountMap = new Map<string, number>();
    await Promise.all(
      workoutIds.map(async (wid) => {
        const count = await this.workoutItemRepo.countMany({ workoutId: wid });
        exerciseCountMap.set(wid, count);
      }),
    );

    const itemDTOs = items.map((item) =>
      this.mapItemToDTO(item, workoutMap.get(item.workout_id), exerciseCountMap.get(item.workout_id) ?? 0),
    );

    return { data: this.mapPlanWithItemsToDTO(plan, itemDTOs) };
  }

  async create(req: Request & { user: AuthUser }, body: CreateWorkoutPlanBody): Promise<WorkoutPlanResponse> {
    const plan = await this.workoutPlanRepo.create({
      user_id: req.user.id,
      name: body.name,
      description: body.description ?? null,
      goal: body.goal ?? null,
      duration_weeks: body.durationWeeks,
    });

    return { data: this.mapPlanToDTO(plan) };
  }

  async update(
    req: Request & { user: AuthUser },
    id: string,
    body: UpdateWorkoutPlanBody,
  ): Promise<WorkoutPlanResponse> {
    const plan = await this.workoutPlanRepo.findById(id);
    if (!plan) {
      throw new NotFoundException('Workout plan not found');
    }
    if (plan.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) {
      updateData.name = body.name;
    }
    if (body.description !== undefined) {
      updateData.description = body.description;
    }
    if (body.goal !== undefined) {
      updateData.goal = body.goal;
    }
    if (body.durationWeeks !== undefined) {
      updateData.duration_weeks = body.durationWeeks;
    }

    const updatedPlan = await this.workoutPlanRepo.updateById(id, updateData as any);

    return { data: this.mapPlanToDTO(updatedPlan) };
  }

  async delete(req: Request & { user: AuthUser }, id: string): Promise<void> {
    const plan = await this.workoutPlanRepo.findById(id);
    if (!plan) {
      throw new NotFoundException('Workout plan not found');
    }
    if (plan.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Items are deleted via CASCADE
    await this.workoutPlanRepo.deleteById(id);
  }

  async addItem(
    req: Request & { user: AuthUser },
    planId: string,
    body: AddWorkoutPlanItemBody,
  ): Promise<WorkoutPlanItemResponse> {
    const plan = await this.workoutPlanRepo.findById(planId);
    if (!plan) {
      throw new NotFoundException('Workout plan not found');
    }
    if (plan.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Validate week number against plan duration
    if (body.weekNumber > plan.duration_weeks) {
      throw new BadRequestException(
        `Week number ${body.weekNumber} exceeds plan duration of ${plan.duration_weeks} weeks`,
      );
    }

    // Verify workout exists and belongs to user
    const workout = await this.workoutRepo.findById(body.workoutId);
    if (!workout) {
      throw new NotFoundException('Workout not found');
    }
    if (workout.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied to this workout');
    }

    const item = await this.workoutPlanItemRepo.create({
      workout_plan_id: planId,
      workout_id: body.workoutId,
      week_number: body.weekNumber,
      day_of_week: body.dayOfWeek,
    });

    const exerciseCount = await this.workoutItemRepo.countMany({ workoutId: workout.id });

    return { data: this.mapItemToDTO(item, workout, exerciseCount) };
  }

  async removeItem(req: Request & { user: AuthUser }, planId: string, itemId: string): Promise<void> {
    const plan = await this.workoutPlanRepo.findById(planId);
    if (!plan) {
      throw new NotFoundException('Workout plan not found');
    }
    if (plan.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    const item = await this.workoutPlanItemRepo.findById(itemId);
    if (!item || item.workout_plan_id !== planId) {
      throw new NotFoundException('Workout plan item not found');
    }

    await this.workoutPlanItemRepo.deleteById(itemId);
  }

  async activate(
    req: Request & { user: AuthUser },
    planId: string,
    body: ActivatePlanBody,
  ): Promise<ActivatePlanResponse> {
    const plan = await this.workoutPlanRepo.findById(planId);
    if (!plan) {
      throw new NotFoundException('Workout plan not found');
    }
    if (plan.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    const items = await this.workoutPlanItemRepo.findMany({
      filter: { workoutPlanId: planId },
    });

    if (items.length === 0) {
      throw new BadRequestException('Cannot activate an empty plan');
    }

    const startDate = new Date(body.startDate + 'T00:00:00');

    // Create schedules for each item
    const schedules = items.map((item) => {
      const date = new Date(startDate);
      // Calculate offset: (weekNumber - 1) * 7 days + (dayOfWeek - 1) days
      // dayOfWeek: 1=Monday, so we add (dayOfWeek - 1) to get to the correct day
      // startDate is assumed to be a Monday (Week 1, Day 1)
      const daysOffset = (item.week_number - 1) * 7 + (item.day_of_week - 1);
      date.setDate(startDate.getDate() + daysOffset);

      return {
        user_id: req.user.id,
        workout_id: item.workout_id,
        scheduled_date: date,
        workout_plan_id: planId,
      };
    });

    await this.workoutScheduleRepo.createMany(schedules);

    return { data: { schedulesCreated: schedules.length } };
  }

  private mapPlanToDTO(plan: WorkoutPlan): WorkoutPlanDTO {
    const createdAt = plan.created_at instanceof Date ? plan.created_at.toISOString() : String(plan.created_at);
    const updatedAt = plan.updated_at instanceof Date ? plan.updated_at.toISOString() : String(plan.updated_at);

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      goal: plan.goal,
      durationWeeks: plan.duration_weeks,
      userId: plan.user_id,
      createdAt,
      updatedAt,
    };
  }

  private mapPlanWithItemsToDTO(plan: WorkoutPlan, items: WorkoutPlanItemDTO[]): WorkoutPlanWithItemsDTO {
    return {
      ...this.mapPlanToDTO(plan),
      items,
    };
  }

  private mapItemToDTO(item: WorkoutPlanItem, workout?: Workout, exerciseCount = 0): WorkoutPlanItemDTO {
    const createdAt = item.created_at instanceof Date ? item.created_at.toISOString() : String(item.created_at);

    const workoutInfo: WorkoutInfoForPlanDTO = workout
      ? {
          id: workout.id,
          name: workout.name,
          description: workout.description,
          type: workout.type,
          difficulty: workout.difficulty,
          exerciseCount,
        }
      : {
          id: item.workout_id,
          name: 'Unknown',
          description: null,
          type: 'custom',
          difficulty: 'moderate',
          exerciseCount: 0,
        };

    return {
      id: item.id,
      weekNumber: item.week_number,
      dayOfWeek: item.day_of_week,
      workout: workoutInfo,
      createdAt,
    };
  }
}
