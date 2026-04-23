import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewUserNutritionGoals, UserNutritionGoals, UserNutritionGoalsUpdate } from 'src/database/interfaces';

@Injectable()
export class UserNutritionGoalsRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<UserNutritionGoals | undefined> {
    return this.db.selectFrom('user_nutrition_goals').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findByUserId(userId: string): Promise<UserNutritionGoals | undefined> {
    return this.db.selectFrom('user_nutrition_goals').selectAll().where('user_id', '=', userId).executeTakeFirst();
  }

  async create(data: NewUserNutritionGoals): Promise<UserNutritionGoals> {
    return this.db.insertInto('user_nutrition_goals').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async update(id: string, data: UserNutritionGoalsUpdate): Promise<UserNutritionGoals | undefined> {
    return this.db
      .updateTable('user_nutrition_goals')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async upsert(data: NewUserNutritionGoals): Promise<UserNutritionGoals> {
    return this.db
      .insertInto('user_nutrition_goals')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['user_id']).doUpdateSet({
          daily_calories: data.daily_calories,
          protein_g: data.protein_g,
          carbs_g: data.carbs_g,
          fat_g: data.fat_g,
          fiber_g: data.fiber_g,
          protein_percent: data.protein_percent,
          carbs_percent: data.carbs_percent,
          fat_percent: data.fat_percent,
          auto_calculate_from_weight: data.auto_calculate_from_weight,
          calories_per_kg: data.calories_per_kg,
          protein_g_per_kg: data.protein_g_per_kg,
          updated_at: sql`now()`,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('user_nutrition_goals').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async deleteByUserId(userId: string): Promise<boolean> {
    const result = await this.db.deleteFrom('user_nutrition_goals').where('user_id', '=', userId).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
