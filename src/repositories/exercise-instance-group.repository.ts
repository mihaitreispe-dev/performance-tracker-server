import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  ExerciseInstanceGroup,
  ExerciseInstanceGroupItem,
  NewExerciseInstanceGroup,
  NewExerciseInstanceGroupItem,
} from 'src/database/interfaces';

@Injectable()
export class ExerciseInstanceGroupRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async create(data: NewExerciseInstanceGroup): Promise<ExerciseInstanceGroup> {
    return this.db.insertInto('exercise_instance_groups').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async findById(id: string): Promise<ExerciseInstanceGroup | undefined> {
    return this.db.selectFrom('exercise_instance_groups').where('id', '=', id).selectAll().executeTakeFirst();
  }

  /**
   * Bulk fetch exercise instance groups by IDs - more efficient than multiple findById calls
   */
  async findByIds(ids: string[]): Promise<ExerciseInstanceGroup[]> {
    if (ids.length === 0) return [];
    return this.db.selectFrom('exercise_instance_groups').where('id', 'in', ids).selectAll().execute();
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.deleteFrom('exercise_instance_groups').where('id', 'in', ids).execute();
  }

  async createGroupItems(data: NewExerciseInstanceGroupItem[]): Promise<ExerciseInstanceGroupItem[]> {
    if (data.length === 0) return [];
    return this.db.insertInto('exercise_instance_group_items').values(data).returningAll().execute();
  }

  async findGroupItemsByGroupIds(groupIds: string[]): Promise<ExerciseInstanceGroupItem[]> {
    if (groupIds.length === 0) return [];
    return this.db
      .selectFrom('exercise_instance_group_items')
      .where('group_id', 'in', groupIds)
      .selectAll()
      .orderBy('position', 'asc')
      .execute();
  }
}
