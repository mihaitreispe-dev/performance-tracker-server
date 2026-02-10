import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, ExerciseInstance, NewExerciseInstance } from 'src/database/interfaces';

@Injectable()
export class ExerciseInstanceRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async create(data: NewExerciseInstance): Promise<ExerciseInstance> {
    return this.db.insertInto('exercise_instances').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async createMany(data: NewExerciseInstance[]): Promise<ExerciseInstance[]> {
    if (data.length === 0) return [];
    return this.db.insertInto('exercise_instances').values(data).returningAll().execute();
  }

  async findById(id: string): Promise<ExerciseInstance | undefined> {
    return this.db.selectFrom('exercise_instances').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByIds(ids: string[]): Promise<ExerciseInstance[]> {
    if (ids.length === 0) return [];
    return this.db.selectFrom('exercise_instances').where('id', 'in', ids).selectAll().execute();
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.deleteFrom('exercise_instances').where('id', 'in', ids).execute();
  }
}
