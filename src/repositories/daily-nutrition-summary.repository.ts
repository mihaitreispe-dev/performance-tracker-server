import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  DailyNutritionSummary,
  DailyNutritionSummaryUpdate,
  Database,
  NewDailyNutritionSummary,
} from 'src/database/interfaces';

export interface WeeklyAverage {
  avg_calories: number;
  avg_protein: number;
  avg_carbs: number;
  avg_fat: number;
  avg_fiber: number;
  total_days: number;
}

export interface MonthlyTrend {
  date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
}

@Injectable()
export class DailyNutritionSummaryRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<DailyNutritionSummary | undefined> {
    return this.db.selectFrom('daily_nutrition_summaries').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findByUserAndDate(userId: string, date: Date | string): Promise<DailyNutritionSummary | undefined> {
    const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
    return this.db
      .selectFrom('daily_nutrition_summaries')
      .selectAll()
      .where('user_id', '=', userId)
      .where('date', '=', sql<Date>`${dateStr}::date`)
      .executeTakeFirst();
  }

  async findByUserAndDateRange(
    userId: string,
    startDate: Date | string,
    endDate: Date | string,
  ): Promise<DailyNutritionSummary[]> {
    const start = startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate;
    const end = endDate instanceof Date ? endDate.toISOString().split('T')[0] : endDate;

    return this.db
      .selectFrom('daily_nutrition_summaries')
      .selectAll()
      .where('user_id', '=', userId)
      .where('date', '>=', sql<Date>`${start}::date`)
      .where('date', '<=', sql<Date>`${end}::date`)
      .orderBy('date', 'asc')
      .execute();
  }

  async create(data: NewDailyNutritionSummary): Promise<DailyNutritionSummary> {
    return this.db.insertInto('daily_nutrition_summaries').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async update(id: string, data: DailyNutritionSummaryUpdate): Promise<DailyNutritionSummary | undefined> {
    return this.db
      .updateTable('daily_nutrition_summaries')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async upsert(data: NewDailyNutritionSummary): Promise<DailyNutritionSummary> {
    return this.db
      .insertInto('daily_nutrition_summaries')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['user_id', 'date']).doUpdateSet({
          total_calories: data.total_calories,
          total_protein: data.total_protein,
          total_carbs: data.total_carbs,
          total_fat: data.total_fat,
          total_fiber: data.total_fiber,
          total_sugar: data.total_sugar,
          total_sodium: data.total_sodium,
          total_potassium: data.total_potassium,
          total_calcium: data.total_calcium,
          total_iron: data.total_iron,
          total_vitamin_a: data.total_vitamin_a,
          total_vitamin_c: data.total_vitamin_c,
          total_vitamin_d: data.total_vitamin_d,
          total_vitamin_b12: data.total_vitamin_b12,
          breakfast_calories: data.breakfast_calories,
          lunch_calories: data.lunch_calories,
          dinner_calories: data.dinner_calories,
          snack_calories: data.snack_calories,
          meal_count: data.meal_count,
          entry_count: data.entry_count,
          updated_at: sql`now()`,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async getWeeklyAverage(userId: string, endDate: Date | string): Promise<WeeklyAverage> {
    const end = endDate instanceof Date ? endDate : new Date(endDate);
    const start = new Date(end);
    start.setDate(start.getDate() - 6); // 7 days including end date

    const result = await this.db
      .selectFrom('daily_nutrition_summaries')
      .select([
        sql<number>`COALESCE(AVG(total_calories::numeric), 0)`.as('avg_calories'),
        sql<number>`COALESCE(AVG(total_protein::numeric), 0)`.as('avg_protein'),
        sql<number>`COALESCE(AVG(total_carbs::numeric), 0)`.as('avg_carbs'),
        sql<number>`COALESCE(AVG(total_fat::numeric), 0)`.as('avg_fat'),
        sql<number>`COALESCE(AVG(total_fiber::numeric), 0)`.as('avg_fiber'),
        sql<number>`COUNT(*)`.as('total_days'),
      ])
      .where('user_id', '=', userId)
      .where('date', '>=', sql<Date>`${start.toISOString().split('T')[0]}::date`)
      .where('date', '<=', sql<Date>`${end.toISOString().split('T')[0]}::date`)
      .executeTakeFirst();

    return {
      avg_calories: Number(result?.avg_calories ?? 0),
      avg_protein: Number(result?.avg_protein ?? 0),
      avg_carbs: Number(result?.avg_carbs ?? 0),
      avg_fat: Number(result?.avg_fat ?? 0),
      avg_fiber: Number(result?.avg_fiber ?? 0),
      total_days: Number(result?.total_days ?? 0),
    };
  }

  async getMonthlyTrend(userId: string, year: number, month: number): Promise<MonthlyTrend[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of month

    const results = await this.db
      .selectFrom('daily_nutrition_summaries')
      .select([sql<string>`date::text`.as('date'), 'total_calories', 'total_protein', 'total_carbs', 'total_fat'])
      .where('user_id', '=', userId)
      .where('date', '>=', sql<Date>`${startDate.toISOString().split('T')[0]}::date`)
      .where('date', '<=', sql<Date>`${endDate.toISOString().split('T')[0]}::date`)
      .orderBy('date', 'asc')
      .execute();

    return results.map((r) => ({
      date: r.date,
      total_calories: Number(r.total_calories),
      total_protein: Number(r.total_protein),
      total_carbs: Number(r.total_carbs),
      total_fat: Number(r.total_fat),
    }));
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('daily_nutrition_summaries').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async deleteByUserAndDate(userId: string, date: Date | string): Promise<boolean> {
    const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
    const result = await this.db
      .deleteFrom('daily_nutrition_summaries')
      .where('user_id', '=', userId)
      .where('date', '=', sql<Date>`${dateStr}::date`)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
