import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { CoachAthleteLabelRow, CoachAthleteLabelUpdate, Database, NewCoachAthleteLabel } from 'src/database/interfaces';

export interface CoachAthleteLabelFilter {
  coachId?: string;
  athleteId?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class CoachAthleteLabelRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<CoachAthleteLabelRow | undefined> {
    return this.db.selectFrom('coach_athlete_labels').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findMany(filter: CoachAthleteLabelFilter = {}): Promise<CoachAthleteLabelRow[]> {
    let query = this.db.selectFrom('coach_athlete_labels').selectAll();

    if (filter.coachId) {
      query = query.where('coach_id', '=', filter.coachId);
    }
    if (filter.athleteId) {
      query = query.where('athlete_id', '=', filter.athleteId);
    }
    // Find labels that overlap with the date range
    if (filter.dateFrom) {
      query = query.where('end_date', '>=', filter.dateFrom);
    }
    if (filter.dateTo) {
      query = query.where('start_date', '<=', filter.dateTo);
    }

    return query.orderBy('start_date', 'asc').execute();
  }

  async create(data: NewCoachAthleteLabel): Promise<CoachAthleteLabelRow> {
    return this.db.insertInto('coach_athlete_labels').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: CoachAthleteLabelUpdate): Promise<CoachAthleteLabelRow> {
    return this.db
      .updateTable('coach_athlete_labels')
      .set({ ...data, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('coach_athlete_labels').where('id', '=', id).execute();
  }

  async deleteByAthleteId(athleteId: string): Promise<void> {
    await this.db.deleteFrom('coach_athlete_labels').where('athlete_id', '=', athleteId).execute();
  }
}
