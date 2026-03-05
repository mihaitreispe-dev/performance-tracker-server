import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, MuscleGroup, NewMuscleGroup } from 'src/database/interfaces';

@Injectable()
export class MuscleGroupRepository {
  constructor(@InjectKysely() protected readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<MuscleGroup | undefined> {
    return this.db.selectFrom('muscle_groups').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByName(name: string): Promise<MuscleGroup | undefined> {
    return this.db.selectFrom('muscle_groups').where('name', '=', name).selectAll().executeTakeFirst();
  }

  async findAll(): Promise<MuscleGroup[]> {
    return this.db.selectFrom('muscle_groups').selectAll().orderBy('name', 'asc').execute();
  }

  async create(data: NewMuscleGroup): Promise<MuscleGroup> {
    return this.db.insertInto('muscle_groups').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async findOrCreate(name: string): Promise<MuscleGroup> {
    const existing = await this.findByName(name);
    if (existing) {
      return existing;
    }
    return this.create({ name });
  }

  async linkToExercise(exerciseId: string, muscleGroupId: string, isPrimary: boolean): Promise<void> {
    await this.db
      .insertInto('exercise_muscle_groups')
      .values({ exercise_id: exerciseId, muscle_group_id: muscleGroupId, is_primary: isPrimary })
      .onConflict((oc) => oc.columns(['exercise_id', 'muscle_group_id']).doNothing())
      .execute();
  }

  async findByExerciseId(exerciseId: string): Promise<(MuscleGroup & { is_primary: boolean })[]> {
    return this.db
      .selectFrom('muscle_groups')
      .innerJoin('exercise_muscle_groups', 'muscle_groups.id', 'exercise_muscle_groups.muscle_group_id')
      .where('exercise_muscle_groups.exercise_id', '=', exerciseId)
      .select([
        'muscle_groups.id',
        'muscle_groups.name',
        'muscle_groups.created_at',
        'muscle_groups.updated_at',
        'exercise_muscle_groups.is_primary',
      ])
      .execute();
  }

  async findPrimaryByExerciseId(exerciseId: string): Promise<MuscleGroup[]> {
    return this.db
      .selectFrom('muscle_groups')
      .innerJoin('exercise_muscle_groups', 'muscle_groups.id', 'exercise_muscle_groups.muscle_group_id')
      .where('exercise_muscle_groups.exercise_id', '=', exerciseId)
      .where('exercise_muscle_groups.is_primary', '=', true)
      .selectAll('muscle_groups')
      .execute();
  }

  async findSecondaryByExerciseId(exerciseId: string): Promise<MuscleGroup[]> {
    return this.db
      .selectFrom('muscle_groups')
      .innerJoin('exercise_muscle_groups', 'muscle_groups.id', 'exercise_muscle_groups.muscle_group_id')
      .where('exercise_muscle_groups.exercise_id', '=', exerciseId)
      .where('exercise_muscle_groups.is_primary', '=', false)
      .selectAll('muscle_groups')
      .execute();
  }

  /**
   * Bulk fetch muscle groups for multiple exercises - more efficient than multiple findByExerciseId calls
   */
  async findByExerciseIds(
    exerciseIds: string[],
  ): Promise<Map<string, (MuscleGroup & { is_primary: boolean })[]>> {
    if (exerciseIds.length === 0) return new Map();

    const results = await this.db
      .selectFrom('muscle_groups')
      .innerJoin('exercise_muscle_groups', 'muscle_groups.id', 'exercise_muscle_groups.muscle_group_id')
      .where('exercise_muscle_groups.exercise_id', 'in', exerciseIds)
      .select([
        'muscle_groups.id',
        'muscle_groups.name',
        'muscle_groups.created_at',
        'muscle_groups.updated_at',
        'exercise_muscle_groups.is_primary',
        'exercise_muscle_groups.exercise_id',
      ])
      .execute();

    const map = new Map<string, (MuscleGroup & { is_primary: boolean })[]>();
    for (const row of results) {
      const exerciseId = row.exercise_id;
      const existing = map.get(exerciseId) || [];
      existing.push({
        id: row.id,
        name: row.name,
        created_at: row.created_at,
        updated_at: row.updated_at,
        is_primary: row.is_primary,
      });
      map.set(exerciseId, existing);
    }
    return map;
  }

  async unlinkFromExercise(exerciseId: string, muscleGroupId: string): Promise<void> {
    await this.db
      .deleteFrom('exercise_muscle_groups')
      .where('exercise_id', '=', exerciseId)
      .where('muscle_group_id', '=', muscleGroupId)
      .execute();
  }
}
