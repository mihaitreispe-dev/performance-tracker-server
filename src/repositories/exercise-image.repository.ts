import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { Kysely } from 'kysely';
import { Database, ExerciseImage, NewExerciseImage } from 'src/database/interfaces';

@Injectable()
export class ExerciseImageRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async create(data: NewExerciseImage): Promise<ExerciseImage> {
    return this.db.insertInto('exercise_images').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async createMany(data: NewExerciseImage[]): Promise<ExerciseImage[]> {
    if (data.length === 0) return [];
    return this.db.insertInto('exercise_images').values(data).returningAll().execute();
  }

  async findByExerciseId(exerciseId: string): Promise<ExerciseImage[]> {
    return this.db
      .selectFrom('exercise_images')
      .selectAll()
      .where('exercise_id', '=', exerciseId)
      .orderBy('position', 'asc')
      .execute();
  }

  async deleteByExerciseId(exerciseId: string): Promise<void> {
    await this.db.deleteFrom('exercise_images').where('exercise_id', '=', exerciseId).execute();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('exercise_images').where('id', '=', id).execute();
  }
}
