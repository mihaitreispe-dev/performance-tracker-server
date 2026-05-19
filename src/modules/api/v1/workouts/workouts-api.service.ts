import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import {
  CardioCategory,
  CardioStep,
  CardioStepGroup,
  CardioStepGroupItem,
  CardioStepMode,
  Exercise,
  ExerciseInstance,
  ExerciseInstanceGroup,
  ExerciseInstanceGroupItem,
  ExerciseInstanceMode,
  ExerciseStatus,
  Workout,
  WorkoutItem,
} from 'src/database/interfaces';
import { CoachAthleteStatus } from 'src/database/interfaces';
import { buildPageLinks } from 'src/lib/http/mappers/build-page-links';
import { assertActiveOrg } from 'src/lib/util/active-org';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { S3Service } from 'src/modules/s3/s3.service';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { CardioCategoryRepository } from 'src/repositories/cardio-category.repository';
import { CardioStepRepository } from 'src/repositories/cardio-step.repository';
import { CardioStepGroupRepository } from 'src/repositories/cardio-step-group.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseImageRepository } from 'src/repositories/exercise-image.repository';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { ExerciseInstanceGroupRepository } from 'src/repositories/exercise-instance-group.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import {
  CardioStepBody,
  CreateWorkoutBody,
  ListWorkoutsQuery,
  UpdateWorkoutBody,
  WorkoutItemBody,
} from './request.dto';
import {
  CardioCategoryDTO,
  CardioStepDTO,
  ExerciseInfoDTO,
  ExerciseInstanceDTO,
  WorkoutDTO,
  WorkoutItemDTO,
  WorkoutListResponse,
  WorkoutResponse,
} from './response.dto';

@Injectable()
export class WorkoutsApiService {
  constructor(
    private readonly workoutRepo: WorkoutRepository,
    private readonly exerciseInstanceRepo: ExerciseInstanceRepository,
    private readonly exerciseInstanceGroupRepo: ExerciseInstanceGroupRepository,
    private readonly exerciseRepo: ExerciseRepository,
    private readonly exerciseImageRepo: ExerciseImageRepository,
    private readonly cardioStepRepo: CardioStepRepository,
    private readonly cardioStepGroupRepo: CardioStepGroupRepository,
    private readonly cardioCategoryRepo: CardioCategoryRepository,
    private readonly workoutScheduleRepo: WorkoutScheduleRepository,
    private readonly relationshipRepo: CoachAthleteRelationshipRepository,
    private readonly privacySettingsRepo: AthletePrivacySettingsRepository,
    private readonly s3Service: S3Service,
    private readonly configService: AppConfigService,
  ) {}

  async list(req: AuthedRequest, query: ListWorkoutsQuery): Promise<WorkoutListResponse> {
    const organisationId = assertActiveOrg(req);
    const { q, offset = 0, limit = 20, type, difficulty, sort } = query;

    const filter = {
      userId: req.user.id,
      type,
      difficulty,
      search: q,
    };

    const [workouts, totalCount] = await Promise.all([
      this.workoutRepo.findMany({ organisationId, filter, sort, offset, limit }),
      this.workoutRepo.countMany(organisationId, filter),
    ]);

    const data = await Promise.all(workouts.map((w) => this.mapWorkoutToDTO(w)));
    const links = buildPageLinks({
      request: req,
      apiUrl: this.configService.apiV1URL,
      limit,
      offset,
      itemCount: workouts.length,
    });

    return { data, links, offset, limit, totalCount };
  }

  async getById(req: AuthedRequest, id: string): Promise<WorkoutResponse> {
    const organisationId = assertActiveOrg(req);
    const workout = await this.workoutRepo.findById(id);
    if (!workout || workout.organisation_id !== organisationId) {
      throw new NotFoundException();
    }

    // Allow access if user owns the workout
    if (workout.user_id === req.user.id) {
      return { data: await this.mapWorkoutToDTO(workout) };
    }

    // Also allow access if the workout was scheduled for this user by a coach
    // Check if there's a schedule for this workout where the user is the athlete
    // and the schedule was created by a coach
    const coachSchedule = await this.workoutScheduleRepo.findCoachCreatedScheduleForUser(req.user.id, id);

    if (coachSchedule) {
      return { data: await this.mapWorkoutToDTO(workout) };
    }

    // Allow coach access to athlete's workout if:
    // 1. Coach has active relationship with the workout owner
    // 2. Athlete has shared workouts with coach
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(req.user.id, workout.user_id);

    if (relationship && relationship.status === CoachAthleteStatus.ACTIVE) {
      const settings = await this.privacySettingsRepo.findByUserId(workout.user_id);
      if (settings?.share_workouts) {
        return { data: await this.mapWorkoutToDTO(workout) };
      }
    }

    throw new NotFoundException();
  }

  /**
   * Get a workout by ID without access checks (for internal service use)
   * Caller is responsible for verifying access permissions
   */
  async getWorkoutByIdInternal(id: string): Promise<WorkoutResponse> {
    const workout = await this.workoutRepo.findById(id);
    if (!workout) {
      throw new NotFoundException();
    }
    return { data: await this.mapWorkoutToDTO(workout) };
  }

  /**
   * Copy a workout to a new user's library
   * Creates a complete copy of the workout including all items
   * @param sourceWorkoutId - The ID of the workout to copy
   * @param targetUserId - The ID of the user to copy the workout to
   * @returns The newly created workout
   */
  async copyWorkoutToUser(sourceWorkoutId: string, targetUserId: string): Promise<WorkoutResponse> {
    const sourceWorkout = await this.workoutRepo.findById(sourceWorkoutId);
    if (!sourceWorkout) {
      throw new NotFoundException('Source workout not found');
    }

    // Check if the user already has a workout with this exact name (scoped to the source org;
    // copies inherit the source's org boundary, see the create() below).
    const existingWorkouts = await this.workoutRepo.findMany({
      organisationId: sourceWorkout.organisation_id,
      filter: { userId: targetUserId, search: sourceWorkout.name },
      limit: 100,
    });
    const exactMatch = existingWorkouts.find((w) => w.name === sourceWorkout.name);
    if (exactMatch) {
      // Return the existing workout instead of creating a duplicate
      return { data: await this.mapWorkoutToDTO(exactMatch) };
    }

    // Create the new workout (without cardio category - user can set their own)
    const newWorkout = await this.workoutRepo.create({
      organisation_id: sourceWorkout.organisation_id,
      name: sourceWorkout.name,
      description: sourceWorkout.description,
      difficulty: sourceWorkout.difficulty,
      type: sourceWorkout.type,
      user_id: targetUserId,
      cardio_category_id: null,
    });

    // Copy all workout items
    const sourceItems = await this.workoutRepo.findWorkoutItemsByWorkoutId(sourceWorkoutId);
    await this.copyWorkoutItems(newWorkout.id, sourceItems);

    return { data: await this.mapWorkoutToDTO(newWorkout) };
  }

  /**
   * Copy workout items from source to target workout
   * Uses batch fetching to avoid N+1 queries
   */
  private async copyWorkoutItems(targetWorkoutId: string, sourceItems: WorkoutItem[]): Promise<void> {
    // Collect all IDs for batch fetching
    const exerciseInstanceIds: string[] = [];
    const exerciseGroupIds: string[] = [];
    const cardioStepIds: string[] = [];
    const cardioStepGroupIds: string[] = [];

    for (const item of sourceItems) {
      if (item.exercise_instance_id) exerciseInstanceIds.push(item.exercise_instance_id);
      if (item.exercise_instance_group_id) exerciseGroupIds.push(item.exercise_instance_group_id);
      if (item.cardio_step_id) cardioStepIds.push(item.cardio_step_id);
      if (item.cardio_step_group_id) cardioStepGroupIds.push(item.cardio_step_group_id);
    }

    // Batch fetch all source data
    const [exerciseInstances, exerciseGroups, exerciseGroupItems, cardioSteps, cardioStepGroups, cardioStepGroupItems] =
      await Promise.all([
        this.exerciseInstanceRepo.findByIds(exerciseInstanceIds),
        this.exerciseInstanceGroupRepo.findByIds(exerciseGroupIds),
        this.exerciseInstanceGroupRepo.findGroupItemsByGroupIds(exerciseGroupIds),
        this.cardioStepRepo.findByIds(cardioStepIds),
        this.cardioStepGroupRepo.findByIds(cardioStepGroupIds),
        this.cardioStepGroupRepo.findGroupItemsByGroupIds(cardioStepGroupIds),
      ]);

    // Build lookup maps
    const instanceMap = new Map(exerciseInstances.map((i) => [i.id, i]));
    const exerciseGroupMap = new Map(exerciseGroups.map((g) => [g.id, g]));
    const cardioStepMap = new Map(cardioSteps.map((s) => [s.id, s]));
    const cardioStepGroupMap = new Map(cardioStepGroups.map((g) => [g.id, g]));

    // Map group items by group ID
    const exerciseGroupItemsMap = new Map<string, typeof exerciseGroupItems>();
    for (const gi of exerciseGroupItems) {
      const existing = exerciseGroupItemsMap.get(gi.group_id) || [];
      existing.push(gi);
      exerciseGroupItemsMap.set(gi.group_id, existing);
    }

    const cardioStepGroupItemsMap = new Map<string, typeof cardioStepGroupItems>();
    for (const gi of cardioStepGroupItems) {
      const existing = cardioStepGroupItemsMap.get(gi.group_id) || [];
      existing.push(gi);
      cardioStepGroupItemsMap.set(gi.group_id, existing);
    }

    // Fetch instances in groups
    const groupInstanceIds = exerciseGroupItems.map((gi) => gi.exercise_instance_id);
    const groupInstances = await this.exerciseInstanceRepo.findByIds(groupInstanceIds);
    for (const inst of groupInstances) {
      instanceMap.set(inst.id, inst);
    }

    // Fetch cardio steps in groups
    const groupCardioStepIds = cardioStepGroupItems.map((gi) => gi.cardio_step_id);
    const groupCardioSteps = await this.cardioStepRepo.findByIds(groupCardioStepIds);
    for (const step of groupCardioSteps) {
      cardioStepMap.set(step.id, step);
    }

    // Now process items and create copies
    for (const item of sourceItems) {
      if (item.exercise_instance_id) {
        const sourceInstance = instanceMap.get(item.exercise_instance_id);
        if (!sourceInstance) continue;

        const newInstance = await this.exerciseInstanceRepo.create({
          exercise_id: sourceInstance.exercise_id,
          mode: sourceInstance.mode,
          sets: sourceInstance.sets,
          reps: sourceInstance.reps,
          execution_time: sourceInstance.execution_time,
          load: sourceInstance.load,
          intensity: sourceInstance.intensity,
          tempo: sourceInstance.tempo,
          notes: sourceInstance.notes,
        });

        await this.workoutRepo.createWorkoutItems([
          {
            workout_id: targetWorkoutId,
            exercise_instance_id: newInstance.id,
            exercise_instance_group_id: null,
            cardio_step_id: null,
            cardio_step_group_id: null,
            position: item.position,
          },
        ]);
      } else if (item.exercise_instance_group_id) {
        const sourceGroup = exerciseGroupMap.get(item.exercise_instance_group_id);
        if (!sourceGroup) continue;

        const sourceGroupItems = exerciseGroupItemsMap.get(item.exercise_instance_group_id) || [];

        const newGroup = await this.exerciseInstanceGroupRepo.create({
          repeat: sourceGroup.repeat,
        });

        // Create all instances for the group in batch
        const newInstances = await this.exerciseInstanceRepo.createMany(
          sourceGroupItems
            .map((gi) => {
              const sourceInstance = instanceMap.get(gi.exercise_instance_id);
              if (!sourceInstance) return null;
              return {
                exercise_id: sourceInstance.exercise_id,
                mode: sourceInstance.mode,
                sets: sourceInstance.sets,
                reps: sourceInstance.reps,
                execution_time: sourceInstance.execution_time,
                load: sourceInstance.load,
                intensity: sourceInstance.intensity,
                tempo: sourceInstance.tempo,
                notes: sourceInstance.notes,
              };
            })
            .filter(Boolean) as any[],
        );

        await this.exerciseInstanceGroupRepo.createGroupItems(
          newInstances.map((inst, idx) => ({
            group_id: newGroup.id,
            exercise_instance_id: inst.id,
            position: sourceGroupItems[idx]?.position ?? idx,
          })),
        );

        await this.workoutRepo.createWorkoutItems([
          {
            workout_id: targetWorkoutId,
            exercise_instance_id: null,
            exercise_instance_group_id: newGroup.id,
            cardio_step_id: null,
            cardio_step_group_id: null,
            position: item.position,
          },
        ]);
      } else if (item.cardio_step_id) {
        const sourceStep = cardioStepMap.get(item.cardio_step_id);
        if (!sourceStep) continue;

        const newStep = await this.cardioStepRepo.create({
          type: sourceStep.type,
          mode: sourceStep.mode,
          duration: sourceStep.duration,
          distance: sourceStep.distance,
          hr_min: sourceStep.hr_min,
          hr_max: sourceStep.hr_max,
          hr_zone: sourceStep.hr_zone,
          power_min: sourceStep.power_min,
          power_max: sourceStep.power_max,
          power_zone: sourceStep.power_zone,
          pace_min: sourceStep.pace_min,
          pace_max: sourceStep.pace_max,
          pace_zone: sourceStep.pace_zone,
          rpe_min: sourceStep.rpe_min,
          rpe_max: sourceStep.rpe_max,
          rpe_zone: sourceStep.rpe_zone,
          notes: sourceStep.notes,
        });

        await this.workoutRepo.createWorkoutItems([
          {
            workout_id: targetWorkoutId,
            exercise_instance_id: null,
            exercise_instance_group_id: null,
            cardio_step_id: newStep.id,
            cardio_step_group_id: null,
            position: item.position,
          },
        ]);
      } else if (item.cardio_step_group_id) {
        const sourceGroup = cardioStepGroupMap.get(item.cardio_step_group_id);
        if (!sourceGroup) continue;

        const sourceGroupItems = cardioStepGroupItemsMap.get(item.cardio_step_group_id) || [];

        const newGroup = await this.cardioStepGroupRepo.create({
          repeat: sourceGroup.repeat,
        });

        // Create all steps for the group in batch
        const newSteps = await this.cardioStepRepo.createMany(
          sourceGroupItems
            .map((gi) => {
              const sourceStep = cardioStepMap.get(gi.cardio_step_id);
              if (!sourceStep) return null;
              return {
                type: sourceStep.type,
                mode: sourceStep.mode,
                duration: sourceStep.duration,
                distance: sourceStep.distance,
                hr_min: sourceStep.hr_min,
                hr_max: sourceStep.hr_max,
                hr_zone: sourceStep.hr_zone,
                power_min: sourceStep.power_min,
                power_max: sourceStep.power_max,
                power_zone: sourceStep.power_zone,
                pace_min: sourceStep.pace_min,
                pace_max: sourceStep.pace_max,
                pace_zone: sourceStep.pace_zone,
                rpe_min: sourceStep.rpe_min,
                rpe_max: sourceStep.rpe_max,
                rpe_zone: sourceStep.rpe_zone,
                notes: sourceStep.notes,
              };
            })
            .filter(Boolean) as any[],
        );

        await this.cardioStepGroupRepo.createGroupItems(
          newSteps.map((step, idx) => ({
            group_id: newGroup.id,
            cardio_step_id: step.id,
            position: sourceGroupItems[idx]?.position ?? idx,
          })),
        );

        await this.workoutRepo.createWorkoutItems([
          {
            workout_id: targetWorkoutId,
            exercise_instance_id: null,
            exercise_instance_group_id: null,
            cardio_step_id: null,
            cardio_step_group_id: newGroup.id,
            position: item.position,
          },
        ]);
      }
    }
  }

  async create(req: AuthedRequest, body: CreateWorkoutBody): Promise<WorkoutResponse> {
    const organisationId = assertActiveOrg(req);
    const workout = await this.workoutRepo.create({
      organisation_id: organisationId,
      name: body.name,
      description: body.description ?? null,
      difficulty: body.difficulty,
      type: body.type,
      user_id: req.user.id,
      cardio_category_id: body.cardioCategoryId ?? null,
    });

    await this.createWorkoutItems(workout.id, body.items);

    return { data: await this.mapWorkoutToDTO(workout) };
  }

  async update(req: Request & { user: AuthUser }, id: string, body: UpdateWorkoutBody): Promise<WorkoutResponse> {
    const existing = await this.workoutRepo.findById(id);
    if (!existing || existing.user_id !== req.user.id) {
      throw new NotFoundException();
    }

    const update: Record<string, any> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.difficulty !== undefined) update.difficulty = body.difficulty;
    if (body.type !== undefined) update.type = body.type;
    if (body.cardioCategoryId !== undefined) update.cardio_category_id = body.cardioCategoryId;

    let workout = existing;
    if (Object.keys(update).length > 0) {
      workout = await this.workoutRepo.updateById(id, update);
    }

    if (body.items !== undefined) {
      await this.deleteExistingWorkoutItems(id);
      await this.createWorkoutItems(id, body.items);
    }

    return { data: await this.mapWorkoutToDTO(workout) };
  }

  async delete(req: Request & { user: AuthUser }, id: string): Promise<void> {
    const existing = await this.workoutRepo.findById(id);
    if (!existing || existing.user_id !== req.user.id) {
      throw new NotFoundException();
    }

    await this.deleteExistingWorkoutItems(id);
    await this.workoutRepo.deleteById(id);
  }

  private async createWorkoutItems(workoutId: string, items: WorkoutItemBody[]): Promise<void> {
    for (let position = 0; position < items.length; position++) {
      const item = items[position];

      if (item.type === 'exercise_instance') {
        if (!item.exerciseId || !item.sets) {
          throw new BadRequestException('exerciseId and sets are required for exercise_instance items');
        }

        const instance = await this.exerciseInstanceRepo.create({
          exercise_id: item.exerciseId,
          mode: item.mode ?? ExerciseInstanceMode.REPS,
          sets: item.sets,
          reps: item.reps ?? null,
          execution_time: item.executionTime ?? null,
          load: item.load != null ? String(item.load) : null,
          intensity: item.intensity ?? null,
          tempo: item.tempo ?? null,
          notes: item.notes ?? null,
        });

        await this.workoutRepo.createWorkoutItems([
          {
            workout_id: workoutId,
            exercise_instance_id: instance.id,
            exercise_instance_group_id: null,
            cardio_step_id: null,
            cardio_step_group_id: null,
            position,
          },
        ]);
      } else if (item.type === 'group') {
        if (!item.items || item.items.length === 0) {
          throw new BadRequestException('items are required for group type');
        }

        const group = await this.exerciseInstanceGroupRepo.create({
          repeat: item.repeat ?? 1,
        });

        const groupInstances = await this.exerciseInstanceRepo.createMany(
          item.items.map((gi) => ({
            exercise_id: gi.exerciseId,
            mode: gi.mode ?? ExerciseInstanceMode.REPS,
            sets: gi.sets,
            reps: gi.reps ?? null,
            execution_time: gi.executionTime ?? null,
            load: gi.load != null ? String(gi.load) : null,
            intensity: gi.intensity ?? null,
            tempo: gi.tempo ?? null,
            notes: gi.notes ?? null,
          })),
        );

        await this.exerciseInstanceGroupRepo.createGroupItems(
          groupInstances.map((inst, idx) => ({
            group_id: group.id,
            exercise_instance_id: inst.id,
            position: idx,
          })),
        );

        await this.workoutRepo.createWorkoutItems([
          {
            workout_id: workoutId,
            exercise_instance_id: null,
            exercise_instance_group_id: group.id,
            cardio_step_id: null,
            cardio_step_group_id: null,
            position,
          },
        ]);
      } else if (item.type === 'cardio_step') {
        if (!item.stepType || !item.cardioStepMode) {
          throw new BadRequestException('stepType and cardioStepMode are required for cardio_step items');
        }

        this.validateCardioStepMode(item.cardioStepMode, item.duration, item.distance);

        const step = await this.cardioStepRepo.create({
          type: item.stepType,
          mode: item.cardioStepMode,
          duration: item.duration ?? null,
          distance: item.distance ?? null,
          hr_min: item.hrMin ?? null,
          hr_max: item.hrMax ?? null,
          hr_zone: item.hrZone ?? null,
          power_min: item.powerMin ?? null,
          power_max: item.powerMax ?? null,
          power_zone: item.powerZone ?? null,
          pace_min: item.paceMin ?? null,
          pace_max: item.paceMax ?? null,
          pace_zone: item.paceZone ?? null,
          rpe_min: item.rpeMin ?? null,
          rpe_max: item.rpeMax ?? null,
          rpe_zone: item.rpeZone ?? null,
          notes: item.notes ?? null,
        });

        await this.workoutRepo.createWorkoutItems([
          {
            workout_id: workoutId,
            exercise_instance_id: null,
            exercise_instance_group_id: null,
            cardio_step_id: step.id,
            cardio_step_group_id: null,
            position,
          },
        ]);
      } else if (item.type === 'cardio_step_group') {
        if (!item.cardioSteps || item.cardioSteps.length === 0) {
          throw new BadRequestException('cardioSteps are required for cardio_step_group type');
        }

        const group = await this.cardioStepGroupRepo.create({
          repeat: item.repeat ?? 1,
        });

        const groupSteps = await this.cardioStepRepo.createMany(
          item.cardioSteps.map((cs: CardioStepBody) => {
            this.validateCardioStepMode(cs.mode, cs.duration, cs.distance);
            return {
              type: cs.stepType,
              mode: cs.mode,
              duration: cs.duration ?? null,
              distance: cs.distance ?? null,
              hr_min: cs.hrMin ?? null,
              hr_max: cs.hrMax ?? null,
              hr_zone: cs.hrZone ?? null,
              power_min: cs.powerMin ?? null,
              power_max: cs.powerMax ?? null,
              power_zone: cs.powerZone ?? null,
              pace_min: cs.paceMin ?? null,
              pace_max: cs.paceMax ?? null,
              pace_zone: cs.paceZone ?? null,
              rpe_min: cs.rpeMin ?? null,
              rpe_max: cs.rpeMax ?? null,
              rpe_zone: cs.rpeZone ?? null,
              notes: cs.notes ?? null,
            };
          }),
        );

        await this.cardioStepGroupRepo.createGroupItems(
          groupSteps.map((step, idx) => ({
            group_id: group.id,
            cardio_step_id: step.id,
            position: idx,
          })),
        );

        await this.workoutRepo.createWorkoutItems([
          {
            workout_id: workoutId,
            exercise_instance_id: null,
            exercise_instance_group_id: null,
            cardio_step_id: null,
            cardio_step_group_id: group.id,
            position,
          },
        ]);
      }
    }
  }

  private validateCardioStepMode(mode: CardioStepMode, duration?: number, distance?: number): void {
    if (mode === CardioStepMode.DURATION && !duration) {
      throw new BadRequestException('duration is required when mode is duration');
    }
    if (mode === CardioStepMode.DISTANCE && !distance) {
      throw new BadRequestException('distance is required when mode is distance');
    }
  }

  private async deleteExistingWorkoutItems(workoutId: string): Promise<void> {
    const existingItems = await this.workoutRepo.findWorkoutItemsByWorkoutId(workoutId);

    const instanceIds: string[] = [];
    const groupIds: string[] = [];
    const cardioStepIds: string[] = [];
    const cardioStepGroupIds: string[] = [];

    for (const item of existingItems) {
      if (item.exercise_instance_id) {
        instanceIds.push(item.exercise_instance_id);
      }
      if (item.exercise_instance_group_id) {
        groupIds.push(item.exercise_instance_group_id);
      }
      if (item.cardio_step_id) {
        cardioStepIds.push(item.cardio_step_id);
      }
      if (item.cardio_step_group_id) {
        cardioStepGroupIds.push(item.cardio_step_group_id);
      }
    }

    // Get group item instance IDs before deleting groups
    if (groupIds.length > 0) {
      const groupItems = await this.exerciseInstanceGroupRepo.findGroupItemsByGroupIds(groupIds);
      for (const gi of groupItems) {
        instanceIds.push(gi.exercise_instance_id);
      }
    }

    // Get cardio step group item IDs before deleting groups
    if (cardioStepGroupIds.length > 0) {
      const cardioGroupItems = await this.cardioStepGroupRepo.findGroupItemsByGroupIds(cardioStepGroupIds);
      for (const gi of cardioGroupItems) {
        cardioStepIds.push(gi.cardio_step_id);
      }
    }

    // Delete workout items first (references)
    await this.workoutRepo.deleteWorkoutItemsByWorkoutId(workoutId);

    // Delete groups (cascades to group items)
    await this.exerciseInstanceGroupRepo.deleteByIds(groupIds);
    await this.cardioStepGroupRepo.deleteByIds(cardioStepGroupIds);

    // Delete exercise instances
    await this.exerciseInstanceRepo.deleteByIds(instanceIds);

    // Delete cardio steps
    await this.cardioStepRepo.deleteByIds(cardioStepIds);
  }

  private async mapWorkoutToDTO(workout: Workout): Promise<WorkoutDTO> {
    const workoutItems = await this.workoutRepo.findWorkoutItemsByWorkoutId(workout.id);
    const items = await this.mapWorkoutItemsToDTOs(workoutItems);

    let cardioCategory: CardioCategoryDTO | null = null;
    if (workout.cardio_category_id) {
      const category = await this.cardioCategoryRepo.findById(workout.cardio_category_id);
      if (category) {
        cardioCategory = this.mapCardioCategoryToDTO(category);
      }
    }

    return {
      id: workout.id,
      name: workout.name,
      description: workout.description,
      difficulty: workout.difficulty,
      type: workout.type,
      userId: workout.user_id,
      cardioCategoryId: workout.cardio_category_id,
      cardioCategory,
      items,
      createdAt: new Date(workout.created_at as unknown as string).toISOString(),
      updatedAt: new Date(workout.updated_at as unknown as string).toISOString(),
    };
  }

  private mapCardioCategoryToDTO(category: CardioCategory): CardioCategoryDTO {
    return {
      id: category.id,
      sportType: category.sport_type,
      name: category.name,
      userId: category.user_id,
    };
  }

  private async mapWorkoutItemsToDTOs(workoutItems: WorkoutItem[]): Promise<WorkoutItemDTO[]> {
    // Collect all IDs
    const instanceIds: string[] = [];
    const groupIds: string[] = [];
    const cardioStepIds: string[] = [];
    const cardioStepGroupIds: string[] = [];

    for (const item of workoutItems) {
      if (item.exercise_instance_id) instanceIds.push(item.exercise_instance_id);
      if (item.exercise_instance_group_id) groupIds.push(item.exercise_instance_group_id);
      if (item.cardio_step_id) cardioStepIds.push(item.cardio_step_id);
      if (item.cardio_step_group_id) cardioStepGroupIds.push(item.cardio_step_group_id);
    }

    // Fetch groups and their items - batch fetch instead of N+1 queries
    const groupItemsByGroupId = new Map<string, ExerciseInstanceGroupItem[]>();
    const groupsById = new Map<string, ExerciseInstanceGroup>();

    if (groupIds.length > 0) {
      const [groups, groupItems] = await Promise.all([
        this.exerciseInstanceGroupRepo.findByIds(groupIds),
        this.exerciseInstanceGroupRepo.findGroupItemsByGroupIds(groupIds),
      ]);

      for (const group of groups) {
        groupsById.set(group.id, group);
      }

      for (const gi of groupItems) {
        instanceIds.push(gi.exercise_instance_id);
        const existing = groupItemsByGroupId.get(gi.group_id) || [];
        existing.push(gi);
        groupItemsByGroupId.set(gi.group_id, existing);
      }
    }

    // Fetch cardio step groups and their items - batch fetch instead of N+1 queries
    const cardioGroupItemsByGroupId = new Map<string, CardioStepGroupItem[]>();
    const cardioGroupsById = new Map<string, CardioStepGroup>();

    if (cardioStepGroupIds.length > 0) {
      const [cardioGroups, cardioGroupItems] = await Promise.all([
        this.cardioStepGroupRepo.findByIds(cardioStepGroupIds),
        this.cardioStepGroupRepo.findGroupItemsByGroupIds(cardioStepGroupIds),
      ]);

      for (const group of cardioGroups) {
        cardioGroupsById.set(group.id, group);
      }

      for (const gi of cardioGroupItems) {
        cardioStepIds.push(gi.cardio_step_id);
        const existing = cardioGroupItemsByGroupId.get(gi.group_id) || [];
        existing.push(gi);
        cardioGroupItemsByGroupId.set(gi.group_id, existing);
      }
    }

    // Fetch all instances
    const uniqueInstanceIds = [...new Set(instanceIds)];
    const instances = await this.exerciseInstanceRepo.findByIds(uniqueInstanceIds);
    const instancesById = new Map(instances.map((i) => [i.id, i]));

    // Fetch all cardio steps
    const uniqueCardioStepIds = [...new Set(cardioStepIds)];
    const cardioSteps = await this.cardioStepRepo.findByIds(uniqueCardioStepIds);
    const cardioStepsById = new Map(cardioSteps.map((s) => [s.id, s]));

    // Collect all exercise IDs and fetch exercises
    const exerciseIds = [...new Set(instances.map((i) => i.exercise_id))];
    const exercises = await this.resolveExercises(exerciseIds);

    // Build DTOs
    const result: WorkoutItemDTO[] = [];

    for (const item of workoutItems) {
      if (item.exercise_instance_id) {
        const instance = instancesById.get(item.exercise_instance_id);
        if (!instance) continue;

        result.push({
          type: 'exercise_instance',
          position: item.position,
          exerciseInstance: await this.mapExerciseInstanceToDTO(instance, exercises),
        });
      } else if (item.exercise_instance_group_id) {
        const group = groupsById.get(item.exercise_instance_group_id);
        if (!group) continue;

        const groupItems = groupItemsByGroupId.get(item.exercise_instance_group_id) || [];
        const groupInstanceDTOs: ExerciseInstanceDTO[] = [];

        for (const gi of groupItems) {
          const instance = instancesById.get(gi.exercise_instance_id);
          if (!instance) continue;
          groupInstanceDTOs.push(await this.mapExerciseInstanceToDTO(instance, exercises));
        }

        result.push({
          type: 'group',
          position: item.position,
          group: {
            id: group.id,
            repeat: group.repeat,
            items: groupInstanceDTOs,
          },
        });
      } else if (item.cardio_step_id) {
        const step = cardioStepsById.get(item.cardio_step_id);
        if (!step) continue;

        result.push({
          type: 'cardio_step',
          position: item.position,
          cardioStep: this.mapCardioStepToDTO(step),
        });
      } else if (item.cardio_step_group_id) {
        const group = cardioGroupsById.get(item.cardio_step_group_id);
        if (!group) continue;

        const groupItems = cardioGroupItemsByGroupId.get(item.cardio_step_group_id) || [];
        const groupStepDTOs: CardioStepDTO[] = [];

        for (const gi of groupItems) {
          const step = cardioStepsById.get(gi.cardio_step_id);
          if (!step) continue;
          groupStepDTOs.push(this.mapCardioStepToDTO(step));
        }

        result.push({
          type: 'cardio_step_group',
          position: item.position,
          cardioStepGroup: {
            id: group.id,
            repeat: group.repeat,
            items: groupStepDTOs,
          },
        });
      }
    }

    return result;
  }

  private mapCardioStepToDTO(step: CardioStep): CardioStepDTO {
    return {
      id: step.id,
      type: step.type,
      mode: step.mode,
      duration: step.duration,
      distance: step.distance,
      hrMin: step.hr_min,
      hrMax: step.hr_max,
      hrZone: step.hr_zone,
      powerMin: step.power_min,
      powerMax: step.power_max,
      powerZone: step.power_zone,
      paceMin: step.pace_min,
      paceMax: step.pace_max,
      paceZone: step.pace_zone,
      rpeMin: step.rpe_min,
      rpeMax: step.rpe_max,
      rpeZone: step.rpe_zone,
      notes: step.notes,
    };
  }

  private async mapExerciseInstanceToDTO(
    instance: ExerciseInstance,
    exercises: Map<string, ExerciseInfoDTO>,
  ): Promise<ExerciseInstanceDTO> {
    const exerciseInfo = exercises.get(instance.exercise_id) || {
      id: instance.exercise_id,
      name: 'Unknown',
      picture: null,
    };

    return {
      id: instance.id,
      exercise: exerciseInfo,
      mode: instance.mode,
      sets: instance.sets,
      reps: instance.reps,
      executionTime: instance.execution_time,
      load: instance.load != null ? Number.parseFloat(instance.load) : null,
      intensity: instance.intensity,
      tempo: instance.tempo,
      notes: instance.notes,
    };
  }

  private async resolveExercises(exerciseIds: string[]): Promise<Map<string, ExerciseInfoDTO>> {
    const result = new Map<string, ExerciseInfoDTO>();
    if (exerciseIds.length === 0) return result;

    // Bulk fetch all exercises instead of N individual queries
    const exercises = await this.exerciseRepo.findByIds(exerciseIds);

    // Resolve pictures in parallel for better performance
    await Promise.all(
      exercises.map(async (exercise) => {
        const picture = await this.getExercisePictureUrl(exercise);
        result.set(exercise.id, {
          id: exercise.id,
          name: exercise.name,
          picture,
        });
      }),
    );

    return result;
  }

  private async getExercisePictureUrl(exercise: Exercise): Promise<string | null> {
    // 1. Check for processed video thumbnail
    if (exercise.status === ExerciseStatus.ASSETS_DONE) {
      const paths = s3Keys.content.exercise({ userId: exercise.user_id, exerciseId: exercise.id });
      if (this.configService.isCloudFrontSigningEnabled && !this.configService.disableCdn) {
        return await this.s3Service.getCloudFrontSignedUrlGET({ key: paths.thumbnail });
      }
      return `${this.configService.cdnUrl}/${paths.thumbnail}`;
    }

    // 2. Check for directly uploaded picture
    if (exercise.picture_s3_bucket && exercise.picture_s3_key) {
      if (this.configService.isCloudFrontSigningEnabled && !this.configService.disableCdn) {
        return await this.s3Service.getCloudFrontSignedUrlGET({ key: exercise.picture_s3_key });
      }
      return await this.s3Service.getSignedUrlGET({
        bucket: exercise.picture_s3_bucket,
        key: exercise.picture_s3_key,
      });
    }

    // 3. Check for exercise images (use first one as thumbnail)
    const images = await this.exerciseImageRepo.findByExerciseId(exercise.id);
    if (images.length > 0) {
      const firstImage = images[0];
      if (this.configService.isCloudFrontSigningEnabled && !this.configService.disableCdn) {
        return await this.s3Service.getCloudFrontSignedUrlGET({ key: firstImage.s3_key });
      }
      return await this.s3Service.getSignedUrlGET({
        bucket: firstImage.s3_bucket,
        key: firstImage.s3_key,
      });
    }

    return null;
  }
}
