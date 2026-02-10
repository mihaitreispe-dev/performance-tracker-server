import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { CardioStep, Database, NewCardioStep } from 'src/database/interfaces';

@Injectable()
export class CardioStepRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async create(data: NewCardioStep): Promise<CardioStep> {
    return this.db.insertInto('cardio_steps').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async createMany(data: NewCardioStep[]): Promise<CardioStep[]> {
    if (data.length === 0) return [];
    return this.db.insertInto('cardio_steps').values(data).returningAll().execute();
  }

  async findById(id: string): Promise<CardioStep | undefined> {
    return this.db.selectFrom('cardio_steps').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByIds(ids: string[]): Promise<CardioStep[]> {
    if (ids.length === 0) return [];
    return this.db.selectFrom('cardio_steps').where('id', 'in', ids).selectAll().execute();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('cardio_steps').where('id', '=', id).execute();
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.deleteFrom('cardio_steps').where('id', 'in', ids).execute();
  }
}
