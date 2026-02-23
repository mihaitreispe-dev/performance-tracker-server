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
import { buildPageLinks } from 'src/lib/http/mappers/build-page-links';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { S3Service } from 'src/modules/s3/s3.service';
import { CardioCategoryRepository } from 'src/repositories/cardio-category.repository';
import { CardioStepRepository } from 'src/repositories/cardio-step.repository';
import { CardioStepGroupRepository } from 'src/repositories/cardio-step-group.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseImageRepository } from 'src/repositories/exercise-image.repository';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { ExerciseInstanceGroupRepository } from 'src/repositories/exercise-instance-group.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';

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
    private readonly s3Service: S3Service,
    private readonly configService: AppConfigService,
  ) {}

  async list(req: Request & { user: AuthUser }, query: ListWorkoutsQuery): Promise<WorkoutListResponse> {
    const { q, offset = 0, limit = 20, type, difficulty, sort } = query;

    const filter = {
      userId: req.user.id,
      type,
      difficulty,
      search: q,
    };

    const [workouts, totalCount] = await Promise.all([
      this.workoutRepo.findMany({ filter, sort, offset, limit }),
      this.workoutRepo.countMany(filter),
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

  async getById(req: Request & { user: AuthUser }, id: string): Promise<WorkoutResponse> {
    const workout = await this.workoutRepo.findById(id);
    if (!workout || workout.user_id !== req.user.id) {
      throw new NotFoundException();
    }

    return { data: await this.mapWorkoutToDTO(workout) };
  }

  async create(req: Request & { user: AuthUser }, body: CreateWorkoutBody): Promise<WorkoutResponse> {
    const workout = await this.workoutRepo.create({
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

    // Fetch groups and their items
    const groupItemsByGroupId = new Map<string, ExerciseInstanceGroupItem[]>();
    const groupsById = new Map<string, ExerciseInstanceGroup>();

    if (groupIds.length > 0) {
      const groupItems = await this.exerciseInstanceGroupRepo.findGroupItemsByGroupIds(groupIds);
      for (const gi of groupItems) {
        instanceIds.push(gi.exercise_instance_id);
        const existing = groupItemsByGroupId.get(gi.group_id) || [];
        existing.push(gi);
        groupItemsByGroupId.set(gi.group_id, existing);
      }

      for (const groupId of groupIds) {
        const group = await this.exerciseInstanceGroupRepo.findById(groupId);
        if (group) groupsById.set(groupId, group);
      }
    }

    // Fetch cardio step groups and their items
    const cardioGroupItemsByGroupId = new Map<string, CardioStepGroupItem[]>();
    const cardioGroupsById = new Map<string, CardioStepGroup>();

    if (cardioStepGroupIds.length > 0) {
      const cardioGroupItems = await this.cardioStepGroupRepo.findGroupItemsByGroupIds(cardioStepGroupIds);
      for (const gi of cardioGroupItems) {
        cardioStepIds.push(gi.cardio_step_id);
        const existing = cardioGroupItemsByGroupId.get(gi.group_id) || [];
        existing.push(gi);
        cardioGroupItemsByGroupId.set(gi.group_id, existing);
      }

      for (const groupId of cardioStepGroupIds) {
        const group = await this.cardioStepGroupRepo.findById(groupId);
        if (group) cardioGroupsById.set(groupId, group);
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
