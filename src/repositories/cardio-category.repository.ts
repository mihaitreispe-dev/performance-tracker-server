import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { CardioCategory, CardioSportType, Database, NewCardioCategory } from 'src/database/interfaces';

export interface CardioCategoryFilter {
  sportType?: CardioSportType;
  userId?: string | null;
}

@Injectable()
export class CardioCategoryRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async create(data: NewCardioCategory): Promise<CardioCategory> {
    return this.db.insertInto('cardio_categories').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async findById(id: string): Promise<CardioCategory | undefined> {
    return this.db.selectFrom('cardio_categories').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findMany(filter?: CardioCategoryFilter): Promise<CardioCategory[]> {
    let query = this.db.selectFrom('cardio_categories').selectAll();

    if (filter?.sportType) {
      query = query.where('sport_type', '=', filter.sportType);
    }

    if (filter?.userId !== undefined) {
      if (filter.userId === null) {
        query = query.where('user_id', 'is', null);
      } else {
        query = query.where((eb) => eb.or([eb('user_id', '=', filter.userId!), eb('user_id', 'is', null)]));
      }
    }

    return query.orderBy('name', 'asc').execute();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('cardio_categories').where('id', '=', id).execute();
  }
}
