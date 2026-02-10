import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  CardioStepGroup,
  CardioStepGroupItem,
  Database,
  NewCardioStepGroup,
  NewCardioStepGroupItem,
} from 'src/database/interfaces';

@Injectable()
export class CardioStepGroupRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async create(data: NewCardioStepGroup): Promise<CardioStepGroup> {
    return this.db.insertInto('cardio_step_groups').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async findById(id: string): Promise<CardioStepGroup | undefined> {
    return this.db.selectFrom('cardio_step_groups').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.deleteFrom('cardio_step_groups').where('id', 'in', ids).execute();
  }

  async createGroupItems(data: NewCardioStepGroupItem[]): Promise<CardioStepGroupItem[]> {
    if (data.length === 0) return [];
    return this.db.insertInto('cardio_step_group_items').values(data).returningAll().execute();
  }

  async findGroupItemsByGroupIds(groupIds: string[]): Promise<CardioStepGroupItem[]> {
    if (groupIds.length === 0) return [];
    return this.db
      .selectFrom('cardio_step_group_items')
      .where('group_id', 'in', groupIds)
      .selectAll()
      .orderBy('position', 'asc')
      .execute();
  }
}
