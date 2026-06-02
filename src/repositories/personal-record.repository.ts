import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  NewPersonalRecord,
  NewPersonalRecordHistory,
  PersonalRecord,
  PersonalRecordHistory,
  PersonalRecordType,
  WorkoutType,
} from 'src/database/interfaces';

export interface FindManyFilter {
  userId: string;
  recordType?: PersonalRecordType;
  exerciseId?: string;
  workoutType?: WorkoutType;
  category?: 'strength' | 'cardio_distance' | 'cardio_other';
}

export interface FindHistoryFilter {
  userId: string;
  recordType: PersonalRecordType;
  exerciseId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface FindRecentFilter {
  userId: string;
  days: number;
}

export interface PeriodComparisonFilter {
  userId: string;
  period1Start: Date;
  period1End: Date;
  period2Start: Date;
  period2End: Date;
}

const STRENGTH_TYPES: PersonalRecordType[] = [
  PersonalRecordType.MAX_WEIGHT,
  PersonalRecordType.MAX_REPS,
  PersonalRecordType.MAX_VOLUME_SET,
];

const CARDIO_DISTANCE_TYPES: PersonalRecordType[] = [
  PersonalRecordType.LONGEST_DISTANCE,
  PersonalRecordType.LONGEST_DURATION,
];

// "Best Efforts" - fastest times for various distances (per sport)
const CARDIO_OTHER_TYPES: PersonalRecordType[] = [
  // Running
  PersonalRecordType.FASTEST_1K,
  PersonalRecordType.FASTEST_5K,
  PersonalRecordType.FASTEST_10K,
  PersonalRecordType.FASTEST_HALF_MARATHON,
  PersonalRecordType.FASTEST_MARATHON,
  // Swimming
  PersonalRecordType.FASTEST_400M,
  PersonalRecordType.FASTEST_800M,
  PersonalRecordType.FASTEST_1500M,
  PersonalRecordType.FASTEST_1900M,
  // Cycling
  PersonalRecordType.FASTEST_20K,
  PersonalRecordType.FASTEST_40K,
  PersonalRecordType.FASTEST_90K,
  PersonalRecordType.FASTEST_100K,
  PersonalRecordType.FASTEST_180K,
];

@Injectable()
export class PersonalRecordRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<PersonalRecord | undefined> {
    return this.db.selectFrom('personal_records').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /**
   * Bulk variant for the in-player exercise card (spec E1). One query
   * scans the user's strength PRs for every exercise in a given
   * workout in a single round-trip, instead of fanning out N
   * findForExercise calls. The caller groups by exercise_id.
   *
   * Empty array → empty result (no exercises means no PRs to fetch);
   * skips the SQL entirely to avoid an `IN ()` validation error.
   */
  async findStrengthPRsForExercises(
    userId: string,
    exerciseIds: string[],
  ): Promise<PersonalRecord[]> {
    if (exerciseIds.length === 0) return [];
    return this.db
      .selectFrom('personal_records')
      .selectAll()
      .where('user_id', '=', userId)
      .where('exercise_id', 'in', exerciseIds)
      .where('record_type', 'in', STRENGTH_TYPES)
      .orderBy('achieved_at', 'desc')
      .execute();
  }

  async findMany(filter: FindManyFilter): Promise<PersonalRecord[]> {
    let query = this.db.selectFrom('personal_records').selectAll().where('user_id', '=', filter.userId);

    if (filter.recordType) {
      query = query.where('record_type', '=', filter.recordType);
    }

    if (filter.exerciseId) {
      query = query.where('exercise_id', '=', filter.exerciseId);
    }

    if (filter.workoutType) {
      query = query.where('workout_type', '=', filter.workoutType);
    }

    if (filter.category === 'strength') {
      query = query.where('record_type', 'in', STRENGTH_TYPES);
    } else if (filter.category === 'cardio_distance') {
      query = query.where('record_type', 'in', CARDIO_DISTANCE_TYPES);
    } else if (filter.category === 'cardio_other') {
      query = query.where('record_type', 'in', CARDIO_OTHER_TYPES);
    }

    return query.orderBy('achieved_at', 'desc').execute();
  }

  async findByUserTypeExerciseAndWorkoutType(
    userId: string,
    recordType: PersonalRecordType,
    exerciseId: string | null,
    workoutType: WorkoutType | null,
  ): Promise<PersonalRecord | undefined> {
    let query = this.db
      .selectFrom('personal_records')
      .selectAll()
      .where('user_id', '=', userId)
      .where('record_type', '=', recordType);

    if (exerciseId) {
      query = query.where('exercise_id', '=', exerciseId);
    } else {
      query = query.where('exercise_id', 'is', null);
    }

    if (workoutType) {
      query = query.where('workout_type', '=', workoutType);
    } else {
      query = query.where('workout_type', 'is', null);
    }

    return query.executeTakeFirst();
  }

  async findForExercise(userId: string, exerciseId: string): Promise<PersonalRecord[]> {
    return this.db
      .selectFrom('personal_records')
      .selectAll()
      .where('user_id', '=', userId)
      .where('exercise_id', '=', exerciseId)
      .where('record_type', 'in', STRENGTH_TYPES)
      .execute();
  }

  async create(data: NewPersonalRecord): Promise<PersonalRecord> {
    return this.db.insertInto('personal_records').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async upsert(data: NewPersonalRecord): Promise<PersonalRecord> {
    return this.db
      .insertInto('personal_records')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['user_id', 'record_type', 'exercise_id', 'workout_type']).doUpdateSet({
          value: data.value,
          unit: data.unit,
          workout_execution_id: data.workout_execution_id,
          achieved_at: data.achieved_at,
          updated_at: sql`now()`,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('personal_records').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  // History methods

  async createHistory(data: NewPersonalRecordHistory): Promise<PersonalRecordHistory> {
    return this.db.insertInto('personal_record_history').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async findHistory(filter: FindHistoryFilter): Promise<PersonalRecordHistory[]> {
    let query = this.db
      .selectFrom('personal_record_history')
      .selectAll()
      .where('user_id', '=', filter.userId)
      .where('record_type', '=', filter.recordType);

    if (filter.exerciseId) {
      query = query.where('exercise_id', '=', filter.exerciseId);
    } else {
      query = query.where('exercise_id', 'is', null);
    }

    if (filter.dateFrom) {
      query = query.where('achieved_at', '>=', filter.dateFrom);
    }

    if (filter.dateTo) {
      query = query.where('achieved_at', '<=', filter.dateTo);
    }

    return query.orderBy('achieved_at', 'asc').execute();
  }

  async findRecentPRs(filter: FindRecentFilter): Promise<PersonalRecordHistory[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - filter.days);

    return this.db
      .selectFrom('personal_record_history')
      .selectAll()
      .where('user_id', '=', filter.userId)
      .where('achieved_at', '>=', cutoffDate)
      .orderBy('achieved_at', 'desc')
      .execute();
  }

  async countPRsInPeriod(userId: string, start: Date, end: Date): Promise<number> {
    const result = await this.db
      .selectFrom('personal_record_history')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('user_id', '=', userId)
      .where('achieved_at', '>=', start)
      .where('achieved_at', '<=', end)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  async getPeriodComparison(filter: PeriodComparisonFilter): Promise<{
    period1Count: number;
    period2Count: number;
    period1PRs: PersonalRecordHistory[];
    period2PRs: PersonalRecordHistory[];
  }> {
    const [period1Count, period2Count, period1PRs, period2PRs] = await Promise.all([
      this.countPRsInPeriod(filter.userId, filter.period1Start, filter.period1End),
      this.countPRsInPeriod(filter.userId, filter.period2Start, filter.period2End),
      this.db
        .selectFrom('personal_record_history')
        .selectAll()
        .where('user_id', '=', filter.userId)
        .where('achieved_at', '>=', filter.period1Start)
        .where('achieved_at', '<=', filter.period1End)
        .orderBy('achieved_at', 'desc')
        .execute(),
      this.db
        .selectFrom('personal_record_history')
        .selectAll()
        .where('user_id', '=', filter.userId)
        .where('achieved_at', '>=', filter.period2Start)
        .where('achieved_at', '<=', filter.period2End)
        .orderBy('achieved_at', 'desc')
        .execute(),
    ]);

    return { period1Count, period2Count, period1PRs, period2PRs };
  }

  /**
   * Get all historical records for a specific record type, sorted by value.
   * For time-based records (fastest times), sorts ascending (lower is better).
   * For other records (max weight, longest distance), sorts descending (higher is better).
   */
  async findAllHistory(filter: {
    userId: string;
    recordType: PersonalRecordType;
    exerciseId?: string;
    workoutType?: WorkoutType;
  }): Promise<PersonalRecordHistory[]> {
    let query = this.db
      .selectFrom('personal_record_history')
      .selectAll()
      .where('user_id', '=', filter.userId)
      .where('record_type', '=', filter.recordType);

    if (filter.exerciseId) {
      query = query.where('exercise_id', '=', filter.exerciseId);
    } else {
      query = query.where('exercise_id', 'is', null);
    }

    if (filter.workoutType) {
      query = query.where('workout_type', '=', filter.workoutType);
    }

    // Determine sort order based on record type
    const isTimeBased = [
      // Running
      PersonalRecordType.FASTEST_1K,
      PersonalRecordType.FASTEST_5K,
      PersonalRecordType.FASTEST_10K,
      PersonalRecordType.FASTEST_HALF_MARATHON,
      PersonalRecordType.FASTEST_MARATHON,
      // Swimming
      PersonalRecordType.FASTEST_400M,
      PersonalRecordType.FASTEST_800M,
      PersonalRecordType.FASTEST_1500M,
      PersonalRecordType.FASTEST_1900M,
      // Cycling
      PersonalRecordType.FASTEST_20K,
      PersonalRecordType.FASTEST_40K,
      PersonalRecordType.FASTEST_90K,
      PersonalRecordType.FASTEST_100K,
      PersonalRecordType.FASTEST_180K,
    ].includes(filter.recordType);

    // For time-based records, lower is better (ascending)
    // For all other records, higher is better (descending)
    const sortDirection = isTimeBased ? 'asc' : 'desc';

    return query.orderBy(sql`CAST(value AS DECIMAL)`, sortDirection).execute();
  }
}
