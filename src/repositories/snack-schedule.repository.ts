import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewSnackSchedule, SnackSchedule } from 'src/database/interfaces';

/**
 * Scheduled-snack access layer. See migration 1774404100000 / the
 * SnackSchedulesTable interface. Mirrors the slice of
 * WorkoutScheduleRepository the calendar needs: create + a
 * date-windowed list scoped to one user.
 */
@Injectable()
export class SnackScheduleRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async create(data: NewSnackSchedule): Promise<SnackSchedule> {
    return this.db
      .insertInto('snack_schedules')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * List a user's scheduled snacks, optionally bounded to a
   * [dateFrom, dateTo] window (inclusive, DATE granularity) so the
   * calendar only pulls the visible month. Both bounds optional —
   * omit for the full set (history-style).
   */
  async listForUser(
    userId: string,
    opts?: { dateFrom?: Date; dateTo?: Date },
  ): Promise<SnackSchedule[]> {
    let query = this.db
      .selectFrom('snack_schedules')
      .where('user_id', '=', userId)
      .selectAll();
    if (opts?.dateFrom) {
      query = query.where('scheduled_date', '>=', opts.dateFrom);
    }
    if (opts?.dateTo) {
      query = query.where('scheduled_date', '<=', opts.dateTo);
    }
    return query.orderBy('scheduled_date', 'asc').execute();
  }
}
