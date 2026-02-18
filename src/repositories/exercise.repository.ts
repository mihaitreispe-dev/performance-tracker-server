import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  Exercise,
  ExerciseStatus,
  ExerciseUpdate,
  ExerciseVisibility,
  NewExercise,
} from 'src/database/interfaces';
import parseSQLArray from 'src/lib/util/parse-sql-array';

export interface ExerciseFilter {
  visibility?: ExerciseVisibility;
  userId?: string;
  search?: string;
}

export interface ExerciseSort {
  field: 'name' | 'created_at' | 'updated_at';
  direction?: 'asc' | 'desc';
}

export interface ExerciseFindManyOptions {
  filter?: ExerciseFilter;
  sort?: ExerciseSort[];
  offset?: number;
  limit?: number;
}

@Injectable()
export class ExerciseRepository {
  constructor(@InjectKysely() protected readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<Exercise | undefined> {
    const result = await this.db.selectFrom('exercises').where('id', '=', id).selectAll().executeTakeFirst();
    if (!result) {
      return result;
    }
    return { ...result, cues: parseSQLArray(result.cues) };
  }

  async findMany(options: ExerciseFindManyOptions = {}): Promise<Exercise[]> {
    const { filter, sort, offset, limit } = options;

    let query = this.db.selectFrom('exercises').selectAll();

    if (filter?.visibility) {
      query = query.where('visibility', '=', filter.visibility);
    }
    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.search) {
      query = query.where('name', 'ilike', `%${filter.search}%`);
    }

    if (sort && sort.length > 0) {
      for (const s of sort) {
        query = query.orderBy(s.field, s.direction ?? 'asc');
      }
    } else {
      query = query.orderBy('created_at', 'desc');
    }

    if (offset !== undefined) {
      query = query.offset(offset);
    }
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    const results = await query.execute();
    return results.map((r) => ({ ...r, cues: parseSQLArray(r.cues) }));
  }

  async countMany(filter?: ExerciseFilter): Promise<number> {
    let query = this.db.selectFrom('exercises').select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter?.visibility) {
      query = query.where('visibility', '=', filter.visibility);
    }
    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.search) {
      query = query.where('name', 'ilike', `%${filter.search}%`);
    }

    const result = await query.executeTakeFirstOrThrow();
    return Number(result.count);
  }

  async create(data: NewExercise): Promise<Exercise> {
    const result = await this.db.insertInto('exercises').values(data).returningAll().executeTakeFirstOrThrow();
    return { ...result, cues: parseSQLArray(result.cues) };
  }

  async updateById(id: string, data: ExerciseUpdate): Promise<Exercise> {
    const result = await this.db
      .updateTable('exercises')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { ...result, cues: parseSQLArray(result.cues) };
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('exercises').where('id', '=', id).execute();
  }

  async findManyWithPendingAssets(): Promise<Exercise[]> {
    const results = await this.db
      .selectFrom('exercises')
      .where('status', '=', ExerciseStatus.ASSETS_PENDING)
      .selectAll()
      .execute();
    return results.map((r) => ({ ...r, cues: parseSQLArray(r.cues) }));
  }
}
