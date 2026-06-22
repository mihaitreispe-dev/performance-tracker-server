import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Category, Database, NewCategory } from 'src/database/interfaces';

/** Global category reference data + the exercise_categories m2m join. Mirrors EquipmentRepository. */
@Injectable()
export class CategoryRepository {
  constructor(@InjectKysely() protected readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<Category | undefined> {
    return this.db.selectFrom('categories').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByName(name: string): Promise<Category | undefined> {
    return this.db.selectFrom('categories').where('name', '=', name).selectAll().executeTakeFirst();
  }

  async findAll(): Promise<Category[]> {
    return this.db.selectFrom('categories').selectAll().orderBy('name', 'asc').execute();
  }

  async create(data: NewCategory): Promise<Category> {
    return this.db.insertInto('categories').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async findOrCreate(name: string): Promise<Category> {
    const existing = await this.findByName(name);
    if (existing) return existing;
    return this.create({ name });
  }

  async linkToExercise(exerciseId: string, categoryId: string): Promise<void> {
    await this.db
      .insertInto('exercise_categories')
      .values({ exercise_id: exerciseId, category_id: categoryId })
      .onConflict((oc) => oc.columns(['exercise_id', 'category_id']).doNothing())
      .execute();
  }

  async findByExerciseId(exerciseId: string): Promise<Category[]> {
    return this.db
      .selectFrom('categories')
      .innerJoin('exercise_categories', 'categories.id', 'exercise_categories.category_id')
      .where('exercise_categories.exercise_id', '=', exerciseId)
      .selectAll('categories')
      .orderBy('categories.name', 'asc')
      .execute();
  }

  async deleteByExerciseId(exerciseId: string): Promise<void> {
    await this.db.deleteFrom('exercise_categories').where('exercise_id', '=', exerciseId).execute();
  }
}
