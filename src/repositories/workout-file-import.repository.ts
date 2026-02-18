import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  NewWorkoutFileImport,
  WorkoutFileImport,
  WorkoutFileImportStatus,
  WorkoutFileImportUpdate,
} from 'src/database/interfaces';

export interface WorkoutFileImportFilter {
  userId?: string;
  status?: WorkoutFileImportStatus;
}

export interface WorkoutFileImportFindManyOptions {
  filter?: WorkoutFileImportFilter;
  offset?: number;
  limit?: number;
}

@Injectable()
export class WorkoutFileImportRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<WorkoutFileImport | undefined> {
    return this.db.selectFrom('workout_file_imports').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findMany(options: WorkoutFileImportFindManyOptions = {}): Promise<WorkoutFileImport[]> {
    const { filter, offset, limit } = options;
    let query = this.db.selectFrom('workout_file_imports').selectAll();

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.status) {
      query = query.where('status', '=', filter.status);
    }

    query = query.orderBy('created_at', 'desc');

    if (offset !== undefined) {
      query = query.offset(offset);
    }
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return query.execute();
  }

  async create(data: NewWorkoutFileImport): Promise<WorkoutFileImport> {
    return this.db.insertInto('workout_file_imports').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: WorkoutFileImportUpdate): Promise<WorkoutFileImport> {
    return this.db
      .updateTable('workout_file_imports')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('workout_file_imports').where('id', '=', id).execute();
  }
}
