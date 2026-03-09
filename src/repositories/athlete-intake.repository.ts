import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { AthleteIntake, AthleteIntakeUpdate, Database, NewAthleteIntake } from 'src/database/interfaces';

@Injectable()
export class AthleteIntakeRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<AthleteIntake | undefined> {
    return this.db.selectFrom('athlete_intake').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByUserAndCoach(userId: string, coachId: string): Promise<AthleteIntake | undefined> {
    return this.db
      .selectFrom('athlete_intake')
      .where('user_id', '=', userId)
      .where('coach_id', '=', coachId)
      .selectAll()
      .executeTakeFirst();
  }

  async findByUserId(userId: string): Promise<AthleteIntake | undefined> {
    return this.db.selectFrom('athlete_intake').where('user_id', '=', userId).selectAll().executeTakeFirst();
  }

  async findManyByCoachId(coachId: string): Promise<AthleteIntake[]> {
    return this.db.selectFrom('athlete_intake').where('coach_id', '=', coachId).selectAll().execute();
  }

  async create(data: NewAthleteIntake): Promise<AthleteIntake> {
    return this.db.insertInto('athlete_intake').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: AthleteIntakeUpdate): Promise<AthleteIntake> {
    return this.db
      .updateTable('athlete_intake')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateByUserAndCoach(userId: string, coachId: string, data: AthleteIntakeUpdate): Promise<AthleteIntake> {
    return this.db
      .updateTable('athlete_intake')
      .set({ ...data, updated_at: sql`now()` })
      .where('user_id', '=', userId)
      .where('coach_id', '=', coachId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async markCompleted(id: string): Promise<AthleteIntake> {
    return this.db
      .updateTable('athlete_intake')
      .set({ completed_at: sql`now()`, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async markCompletedByUserAndCoach(userId: string, coachId: string): Promise<AthleteIntake> {
    return this.db
      .updateTable('athlete_intake')
      .set({ completed_at: sql`now()`, updated_at: sql`now()` })
      .where('user_id', '=', userId)
      .where('coach_id', '=', coachId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('athlete_intake').where('id', '=', id).execute();
  }

  async deleteByUserAndCoach(userId: string, coachId: string): Promise<void> {
    await this.db.deleteFrom('athlete_intake').where('user_id', '=', userId).where('coach_id', '=', coachId).execute();
  }
}
