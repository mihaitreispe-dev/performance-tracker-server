import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  NewRecoveryJournalEntry,
  RecoveryJournalEntry,
  UpdateRecoveryJournalEntry,
} from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';

interface FindManyFilter {
  userId: string;
  dateFrom?: Date;
  dateTo?: Date;
}

interface FindManyOptions {
  filter: FindManyFilter;
  sort?: { field: 'entry_date'; direction: 'asc' | 'desc' }[];
  limit?: number;
  offset?: number;
}

@Injectable()
export class RecoveryJournalRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<RecoveryJournalEntry | undefined> {
    return this.db.selectFrom('recovery_journal_entries').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findByUserAndDate(userId: string, date: Date): Promise<RecoveryJournalEntry | undefined> {
    const dateStr = formatDateToYMD(date);
    return this.db
      .selectFrom('recovery_journal_entries')
      .selectAll()
      .where('user_id', '=', userId)
      .where(sql`entry_date::text`, '=', dateStr)
      .executeTakeFirst();
  }

  async findMany(options: FindManyOptions): Promise<RecoveryJournalEntry[]> {
    let query = this.db.selectFrom('recovery_journal_entries').selectAll().where('user_id', '=', options.filter.userId);

    if (options.filter.dateFrom) {
      const dateFromStr = formatDateToYMD(options.filter.dateFrom);
      query = query.where(sql`entry_date::text`, '>=', dateFromStr);
    }

    if (options.filter.dateTo) {
      const dateToStr = formatDateToYMD(options.filter.dateTo);
      query = query.where(sql`entry_date::text`, '<=', dateToStr);
    }

    if (options.sort) {
      for (const sort of options.sort) {
        query = query.orderBy(sort.field, sort.direction);
      }
    } else {
      query = query.orderBy('entry_date', 'desc');
    }

    if (options.offset) {
      query = query.offset(options.offset);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query.execute();
  }

  async countMany(filter: FindManyFilter): Promise<number> {
    let query = this.db
      .selectFrom('recovery_journal_entries')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('user_id', '=', filter.userId);

    if (filter.dateFrom) {
      const dateFromStr = formatDateToYMD(filter.dateFrom);
      query = query.where(sql`entry_date::text`, '>=', dateFromStr);
    }

    if (filter.dateTo) {
      const dateToStr = formatDateToYMD(filter.dateTo);
      query = query.where(sql`entry_date::text`, '<=', dateToStr);
    }

    const result = await query.executeTakeFirstOrThrow();
    return Number(result.count);
  }

  async getLatestForUser(userId: string): Promise<RecoveryJournalEntry | undefined> {
    return this.db
      .selectFrom('recovery_journal_entries')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('entry_date', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async getHistory(userId: string, days: number = 30): Promise<RecoveryJournalEntry[]> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    const dateFromStr = formatDateToYMD(dateFrom);

    return this.db
      .selectFrom('recovery_journal_entries')
      .selectAll()
      .where('user_id', '=', userId)
      .where(sql`entry_date::text`, '>=', dateFromStr)
      .orderBy('entry_date', 'desc')
      .execute();
  }

  async create(data: NewRecoveryJournalEntry): Promise<RecoveryJournalEntry> {
    return this.db.insertInto('recovery_journal_entries').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async upsert(data: NewRecoveryJournalEntry): Promise<RecoveryJournalEntry> {
    return this.db
      .insertInto('recovery_journal_entries')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['user_id', 'entry_date']).doUpdateSet({
          sleep_quality_rating: data.sleep_quality_rating,
          sleep_latency_minutes: data.sleep_latency_minutes,
          sleep_disturbances: data.sleep_disturbances,
          perceived_recovery: data.perceived_recovery,
          muscle_soreness: data.muscle_soreness,
          energy_level: data.energy_level,
          mood: data.mood,
          stress_level: data.stress_level,
          motivation_level: data.motivation_level,
          caffeine_mg: data.caffeine_mg,
          caffeine_cutoff_time: data.caffeine_cutoff_time,
          alcohol_units: data.alcohol_units,
          hydration_liters: data.hydration_liters,
          meal_quality: data.meal_quality,
          injury_concerns: data.injury_concerns,
          notes: data.notes,
          updated_at: sql`now()`,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(id: string, data: UpdateRecoveryJournalEntry): Promise<RecoveryJournalEntry | undefined> {
    return this.db
      .updateTable('recovery_journal_entries')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('recovery_journal_entries').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async getAverageMetrics(
    userId: string,
    days: number = 30,
  ): Promise<{
    avgPerceivedRecovery: number | null;
    avgMuscleSoreness: number | null;
    avgEnergyLevel: number | null;
    avgMood: number | null;
    avgStressLevel: number | null;
    avgMotivationLevel: number | null;
  }> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    const dateFromStr = formatDateToYMD(dateFrom);

    const result = await this.db
      .selectFrom('recovery_journal_entries')
      .select([
        sql<number>`AVG(perceived_recovery)`.as('avgPerceivedRecovery'),
        sql<number>`AVG(muscle_soreness)`.as('avgMuscleSoreness'),
        sql<number>`AVG(energy_level)`.as('avgEnergyLevel'),
        sql<number>`AVG(mood)`.as('avgMood'),
        sql<number>`AVG(stress_level)`.as('avgStressLevel'),
        sql<number>`AVG(motivation_level)`.as('avgMotivationLevel'),
      ])
      .where('user_id', '=', userId)
      .where(sql`entry_date::text`, '>=', dateFromStr)
      .executeTakeFirst();

    return {
      avgPerceivedRecovery: result?.avgPerceivedRecovery ?? null,
      avgMuscleSoreness: result?.avgMuscleSoreness ?? null,
      avgEnergyLevel: result?.avgEnergyLevel ?? null,
      avgMood: result?.avgMood ?? null,
      avgStressLevel: result?.avgStressLevel ?? null,
      avgMotivationLevel: result?.avgMotivationLevel ?? null,
    };
  }
}
