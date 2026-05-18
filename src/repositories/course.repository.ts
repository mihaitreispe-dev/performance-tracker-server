import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Course,
  CourseCompletion,
  CourseLesson,
  CourseStatus,
  CourseUpdate,
  Database,
  NewCourse,
  NewCourseCompletion,
  NewCourseLesson,
} from 'src/database/interfaces';

@Injectable()
export class CourseRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string, organisationId: string): Promise<Course | undefined> {
    return this.db
      .selectFrom('courses')
      .where('id', '=', id)
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .executeTakeFirst();
  }

  async list(
    organisationId: string,
    filter: { status?: CourseStatus } = {},
    pagination?: { limit?: number; offset?: number },
  ): Promise<Course[]> {
    let query = this.db.selectFrom('courses').where('organisation_id', '=', organisationId).selectAll();
    if (filter.status) {
      query = query.where('status', '=', filter.status);
    }
    return query
      .orderBy('created_at', 'desc')
      .limit(pagination?.limit ?? 100)
      .offset(pagination?.offset ?? 0)
      .execute();
  }

  async create(data: NewCourse): Promise<Course> {
    return this.db.insertInto('courses').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: CourseUpdate): Promise<Course> {
    return this.db
      .updateTable('courses')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('courses').where('id', '=', id).execute();
  }

  // ---- lessons ----

  async listLessons(courseId: string): Promise<CourseLesson[]> {
    return this.db
      .selectFrom('course_lessons')
      .where('course_id', '=', courseId)
      .selectAll()
      .orderBy('sort_order', 'asc')
      .execute();
  }

  async findLessonById(lessonId: string): Promise<CourseLesson | undefined> {
    return this.db.selectFrom('course_lessons').where('id', '=', lessonId).selectAll().executeTakeFirst();
  }

  async addLesson(data: NewCourseLesson): Promise<CourseLesson> {
    return this.db.insertInto('course_lessons').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async nextSortOrder(courseId: string): Promise<number> {
    const row = await this.db
      .selectFrom('course_lessons')
      .where('course_id', '=', courseId)
      .select((eb) => eb.fn.max('sort_order').as('max_order'))
      .executeTakeFirst();
    const max = row?.max_order;
    return typeof max === 'number' ? max + 1 : 0;
  }

  async reorderLessons(courseId: string, orderedLessonIds: string[]): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      // Two-pass to avoid running afoul of any unique constraint on (course_id, sort_order).
      const offset = 1_000_000;
      for (let i = 0; i < orderedLessonIds.length; i++) {
        await trx
          .updateTable('course_lessons')
          .set({ sort_order: i + offset })
          .where('id', '=', orderedLessonIds[i])
          .where('course_id', '=', courseId)
          .execute();
      }
      for (let i = 0; i < orderedLessonIds.length; i++) {
        await trx
          .updateTable('course_lessons')
          .set({ sort_order: i })
          .where('id', '=', orderedLessonIds[i])
          .where('course_id', '=', courseId)
          .execute();
      }
    });
  }

  async removeLesson(courseId: string, lessonId: string): Promise<void> {
    await this.db
      .deleteFrom('course_lessons')
      .where('course_id', '=', courseId)
      .where('id', '=', lessonId)
      .execute();
  }

  // ---- completions ----

  async markComplete(data: NewCourseCompletion): Promise<CourseCompletion> {
    return this.db
      .insertInto('course_completions')
      .values(data)
      .onConflict((oc) => oc.columns(['lesson_id', 'athlete_user_id']).doNothing())
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async listCompletionsForAthlete(courseId: string, athleteUserId: string): Promise<CourseCompletion[]> {
    return this.db
      .selectFrom('course_completions')
      .where('course_id', '=', courseId)
      .where('athlete_user_id', '=', athleteUserId)
      .selectAll()
      .execute();
  }
}
