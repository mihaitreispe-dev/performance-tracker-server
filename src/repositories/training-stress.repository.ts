import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { Kysely, sql } from 'kysely';
import {
  Database,
  TrainingStressScore,
  NewTrainingStressScore,
  UpdateTrainingStressScore,
} from 'src/database/interfaces';

interface FindManyFilter {
  workoutExecutionIds?: string[];
  dateFrom?: Date;
  dateTo?: Date;
}

interface FindManyOptions {
  filter: FindManyFilter;
  sort?: { field: 'calculated_at'; direction: 'asc' | 'desc' }[];
  limit?: number;
}

@Injectable()
export class TrainingStressRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<TrainingStressScore | undefined> {
    return this.db
      .selectFrom('training_stress_scores')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async findByWorkoutExecutionId(workoutExecutionId: string): Promise<TrainingStressScore | undefined> {
    return this.db
      .selectFrom('training_stress_scores')
      .selectAll()
      .where('workout_execution_id', '=', workoutExecutionId)
      .executeTakeFirst();
  }

  async findMany(options: FindManyOptions): Promise<TrainingStressScore[]> {
    let query = this.db
      .selectFrom('training_stress_scores')
      .selectAll();

    if (options.filter.workoutExecutionIds && options.filter.workoutExecutionIds.length > 0) {
      query = query.where('workout_execution_id', 'in', options.filter.workoutExecutionIds);
    }

    if (options.filter.dateFrom) {
      query = query.where('calculated_at', '>=', options.filter.dateFrom);
    }

    if (options.filter.dateTo) {
      query = query.where('calculated_at', '<=', options.filter.dateTo);
    }

    if (options.sort) {
      for (const sort of options.sort) {
        query = query.orderBy(sort.field, sort.direction);
      }
    } else {
      query = query.orderBy('calculated_at', 'desc');
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query.execute();
  }

  async findByUserAndDateRange(
    userId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<(TrainingStressScore & { completed_at: Date })[]> {
    return this.db
      .selectFrom('training_stress_scores')
      .innerJoin('workout_executions', 'workout_executions.id', 'training_stress_scores.workout_execution_id')
      .selectAll('training_stress_scores')
      .select('workout_executions.completed_at')
      .where('workout_executions.user_id', '=', userId)
      .where('workout_executions.completed_at', '>=', dateFrom)
      .where('workout_executions.completed_at', '<=', dateTo)
      .orderBy('workout_executions.completed_at', 'asc')
      .execute() as Promise<(TrainingStressScore & { completed_at: Date })[]>;
  }

  async getTotalTSSForDate(userId: string, date: Date): Promise<number> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await this.db
      .selectFrom('training_stress_scores')
      .innerJoin('workout_executions', 'workout_executions.id', 'training_stress_scores.workout_execution_id')
      .select(sql<string>`COALESCE(SUM(training_stress_scores.tss), 0)`.as('total_tss'))
      .where('workout_executions.user_id', '=', userId)
      .where('workout_executions.completed_at', '>=', startOfDay)
      .where('workout_executions.completed_at', '<=', endOfDay)
      .executeTakeFirst();

    return parseFloat(result?.total_tss || '0');
  }

  async create(data: NewTrainingStressScore): Promise<TrainingStressScore> {
    return this.db
      .insertInto('training_stress_scores')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async upsert(data: NewTrainingStressScore): Promise<TrainingStressScore> {
    return this.db
      .insertInto('training_stress_scores')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['workout_execution_id']).doUpdateSet({
          tss: data.tss,
          trimp: data.trimp,
          aerobic_te: data.aerobic_te,
          anaerobic_te: data.anaerobic_te,
          estimated_recovery_hours: data.estimated_recovery_hours,
          intensity_factor: data.intensity_factor,
          normalized_power: data.normalized_power,
          normalized_pace: data.normalized_pace,
          hrss: data.hrss,
          metadata: data.metadata,
          calculated_at: data.calculated_at || sql`now()`,
          updated_at: sql`now()`,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(id: string, data: UpdateTrainingStressScore): Promise<TrainingStressScore | undefined> {
    return this.db
      .updateTable('training_stress_scores')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('training_stress_scores')
      .where('id', '=', id)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async deleteByWorkoutExecutionId(workoutExecutionId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('training_stress_scores')
      .where('workout_execution_id', '=', workoutExecutionId)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
