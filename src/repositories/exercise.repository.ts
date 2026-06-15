import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
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
  /** Match exercises linked to ANY of these equipment ids. */
  equipmentIds?: string[];
}

export interface ExerciseSort {
  field: 'name' | 'created_at' | 'updated_at';
  direction?: 'asc' | 'desc';
}

export interface ExerciseFindManyOptions {
  /**
   * Active organisation id. Tenant-scoped queries return rows owned by this org plus
   * any row marked PUBLIC (the cross-tenant exercise library).
   */
  organisationId: string;
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

  /**
   * Bulk fetch exercises by IDs - more efficient than multiple findById calls.
   * Caller is responsible for tenant-checking the results.
   */
  async findByIds(ids: string[]): Promise<Exercise[]> {
    if (ids.length === 0) return [];

    const results = await this.db.selectFrom('exercises').where('id', 'in', ids).selectAll().execute();

    return results.map((r) => ({ ...r, cues: parseSQLArray(r.cues) }));
  }

  async findMany(options: ExerciseFindManyOptions): Promise<Exercise[]> {
    const { organisationId, filter, sort, offset, limit } = options;

    let query = this.db
      .selectFrom('exercises')
      .where((eb) =>
        eb.or([
          eb('organisation_id', '=', organisationId),
          eb('visibility', '=', ExerciseVisibility.PUBLIC),
        ]),
      )
      .selectAll();

    if (filter?.visibility) {
      query = query.where('visibility', '=', filter.visibility);
    }
    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.search) {
      query = query.where('name', 'ilike', `%${filter.search}%`);
    }
    if (filter?.equipmentIds && filter.equipmentIds.length > 0) {
      const equipmentIds = filter.equipmentIds;
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('exercise_equipment as ee')
            .select('ee.exercise_id')
            .whereRef('ee.exercise_id', '=', 'exercises.id')
            .where('ee.equipment_id', 'in', equipmentIds),
        ),
      );
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

  async countMany(organisationId: string, filter?: ExerciseFilter): Promise<number> {
    let query = this.db
      .selectFrom('exercises')
      .where((eb) =>
        eb.or([
          eb('organisation_id', '=', organisationId),
          eb('visibility', '=', ExerciseVisibility.PUBLIC),
        ]),
      )
      .select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter?.visibility) {
      query = query.where('visibility', '=', filter.visibility);
    }
    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.search) {
      query = query.where('name', 'ilike', `%${filter.search}%`);
    }
    if (filter?.equipmentIds && filter.equipmentIds.length > 0) {
      const equipmentIds = filter.equipmentIds;
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('exercise_equipment as ee')
            .select('ee.exercise_id')
            .whereRef('ee.exercise_id', '=', 'exercises.id')
            .where('ee.equipment_id', 'in', equipmentIds),
        ),
      );
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

  /**
   * System / background-worker path: returns rows across all tenants whose assets are still
   * being processed. Do NOT use from request paths.
   */
  async findManyWithPendingAssets(): Promise<Exercise[]> {
    const results = await this.db
      .selectFrom('exercises')
      .where('status', '=', ExerciseStatus.ASSETS_PENDING)
      .selectAll()
      .execute();
    return results.map((r) => ({ ...r, cues: parseSQLArray(r.cues) }));
  }

  /**
   * System / background-worker path: rows waiting for the local ffmpeg cron
   * to claim and transcode them. Skips rows claimed within the last 10
   * minutes (a process restart resumes after that window, while a single
   * still-running cron tick won't double-claim its own queue). Limited so a
   * tick doesn't lock the worker on a huge backlog. Do NOT use from request
   * paths.
   */
  async findManyLocalTranscodePending(limit = 3): Promise<Exercise[]> {
    const results = await this.db
      .selectFrom('exercises')
      .where('local_transcode_pending', '=', true)
      .where('status', '=', ExerciseStatus.ASSETS_PENDING)
      .where((eb) =>
        eb.or([
          eb('local_transcode_started_at', 'is', null),
          eb('local_transcode_started_at', '<', sql<Date>`now() - interval '10 minutes'`),
        ]),
      )
      .selectAll()
      .limit(limit)
      .execute();
    return results.map((r) => ({ ...r, cues: parseSQLArray(r.cues) }));
  }

  /**
   * System / background-worker path: rows in the smart-crop analysis phase —
   * pending assets, a Rekognition job in flight, but no MediaConvert job yet.
   * The smart-crop cron polls these to completion then creates the encode
   * job. Do NOT use from request paths.
   */
  async findManyAnalyzingSmartCrop(): Promise<Exercise[]> {
    const results = await this.db
      .selectFrom('exercises')
      .where('status', '=', ExerciseStatus.ASSETS_PENDING)
      .where('rekognition_job_id', 'is not', null)
      .where('media_convert_job_id', 'is', null)
      .selectAll()
      .execute();
    return results.map((r) => ({ ...r, cues: parseSQLArray(r.cues) }));
  }

  /**
   * System / backfill path: every exercise that still has its uploaded
   * source clip, across all tenants — optionally narrowed to specific
   * statuses. Used by the reprocess-assets backfill script to re-encode the
   * existing library through a newer MediaConvert pipeline. Do NOT use from
   * request paths.
   */
  async findAllWithSourceVideo(statuses?: ExerciseStatus[]): Promise<Exercise[]> {
    let query = this.db.selectFrom('exercises').where('video_s3_key', 'is not', null).selectAll();
    if (statuses && statuses.length > 0) {
      query = query.where('status', 'in', statuses);
    }
    const results = await query.execute();
    return results.map((r) => ({ ...r, cues: parseSQLArray(r.cues) }));
  }
}
